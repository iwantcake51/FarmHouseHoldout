// The survivor's look, dealt fresh at the start of every run: skin tone, hair and its style, beard, eye colour, hat,
// top, trousers, shoes, the colours of the pack and its bedroll, and of the holster. The pieces sit in their own groups on the rig so they can be
// cleared and rebuilt; colours something else changes later (the shirt under a jacket, skin) stay shared materials,
// the rest is baked into a few merged meshes per body part.

import { pick, rand, rr } from '../core/math.js';
import { outline } from '../effects/screen-outlines.js';
import { basic, lam } from '../core/shaders.js';
import { box, finePieces, mergeInto, trimShadows, unfight } from '../core/geometry.js';
import { KNEE_Y, PACK, PM, pOutline } from './player.js';
import { xrayAttach } from '../effects/outlines.js';

export const LOOK = { g: {}, cur: null, mirrorY: 0.214, xrayReady: false };
// each group and the rig part it rides on (the hat and the shoes get their own, so gear can hide them)
const LOOK_ON = { head: PM.head, hat: PM.head, torso: PM.torso, armL: PM.armL, armR: PM.armR, legL: PM.legL, legR: PM.legR, shinL: PM.shinL, shinR: PM.shinR, shoeL: PM.shinL, shoeR: PM.shinR };
for (const k in LOOK_ON) { const g = new THREE.Group(); LOOK_ON[k].add(g); LOOK.g[k] = g; if (LOOK_ON[k] === PM.shinL || LOOK_ON[k] === PM.shinR) g.position.y = -KNEE_Y; }   // (laid out in the whole leg's space, from the hip)
export const PBOOT = [LOOK.g.shoeL, LOOK.g.shoeR];   // hidden by gear.js when you've upgraded your footwear
export const LOOKS = {
  skin: [0xf2cfae, 0xe3b48f, 0xd2a07c, 0xbd8761, 0x9c6a46, 0x7a4e32, 0x5a3824],
  hair: [0x1e1814, 0x3a2a1e, 0x5e4026, 0x8a4a26, 0xc8a060, 0x9a948a],
  hairStyle: ['short', 'short', 'long', 'buzz', 'bald'],
  // facial hair, weighted by how often you'd see it on a farm in a bad week
  beard: ['none', 'none', 'none', 'stubble', 'stubble', 'stubble', 'heavyStubble', 'heavyStubble', 'full', 'full', 'longBeard', 'mustache', 'mustache', 'handlebar',
    'horseshoe', 'goatee', 'goatee', 'vandyke', 'soulPatch', 'chinstrap', 'muttonChops', 'sideburns'],
  // the face itself: eyes, brows, nose and mouth each one of a few shapes, and now and then a scar, tired eyes or lines
  eyeShape: ['beady', 'beady', 'narrow', 'narrow', 'tired', 'tired', 'wide', 'droopy', 'deepset', 'oneSquint'],
  brow: ['flat', 'flat', 'raised', 'furrow', 'furrow', 'heavy', 'thin', 'unibrow', 'arched', 'bushy', 'sparse', 'skeptic'],
  nose: ['small', 'long', 'long', 'wide', 'crooked', 'button', 'hooked'], mouth: ['line', 'line', 'thin', 'frown', 'smirk', 'smirk', 'grim'],
  // dark and light browns most often, then hazel, greens, blues, greys and amber
  eyes: [0x2e1e12, 0x3a2414, 0x4a2e1c, 0x4a2e1c, 0x5e3a1e, 0x6a4a28, 0x6a5a2a, 0x5a6a34, 0x3e7a48, 0x2e5e3a, 0x3e6e9e, 0x5a8ab8, 0x4a5e70, 0x6e7c84, 0x8a6a2a],
  hat: ['cap', 'cap', 'beanie', 'cowboy', 'bandana', 'none'],
  hatCol: {
    cap: [0xc4612a, 0x9a2a22, 0x3a5a3a, 0x2e4a6a, 0x2a2a2a, 0xb09060], beanie: [0x3a4a5a, 0x8a2a22, 0x4a5a36, 0x2a2a2a, 0xc8a040],
    cowboy: [0x6a4a2a, 0x9a7a4a, 0x3a2a1e], bandana: [0x9a2a22, 0x2e4a7a, 0x2a2a2a]
  },
  top: ['work', 'work', 'tee', 'flannel', 'hoodie', 'polo', 'poloLong'],
  topCol: {
    work: [0x4e5a3c, 0x7a6a44, 0x4a6080, 0x6a4a30, 0x5a5e62], tee: [0x8a8a86, 0x2e2e30, 0xa83a2a, 0x3a5a7a, 0xd8d2c4, 0x4e5a3c],
    flannel: [0x9a2e24, 0x3e5a3a, 0x34507a, 0x6a4a2a], hoodie: [0x6a6a6a, 0x2e3a54, 0x4a5236, 0x5e2a2a, 0x2a2a2c],
    polo: [0x2e3a54, 0xd8d4cc, 0x8a2a22, 0x3a5a3a, 0x7a9ab8, 0x2a2a2c, 0xb8a47a, 0xc8a040], poloLong: [0x2e3a54, 0xd8d4cc, 0x3a5a3a, 0x5a5e62, 0x6a2a2e, 0x2a2a2c],
    // the suit, rare (SUIT_ODDS): charcoal, navy, black, grey, brown or taupe, with its trousers to match
    suit: [0x2a2c30, 0x2a2c30, 0x1e2434, 0x18181a, 0x4a4a4e, 0x4a3a2a, 0x5a5448]
  },
  // under a flannel, a work shirt or a tee: a thermal (white most often, cream, oatmeal, heather grey, charcoal, or the
  // red of long johns), showing at the open collar; its long sleeves are in the shirt's colour (buildLook)
  under: [0xe6e2d8, 0xe6e2d8, 0xe6e2d8, 0xd8cfb8, 0xc8bca0, 0x8a8a86, 0x3a3a3c, 0x7a2a24],
  underOdds: { flannel: 0.5, work: 0.35, tee: 0.22, polo: 0.08 },
  // what a suit comes with: a dress shirt (white, pale blue, pale pink, grey), a tie (red, navy, black, maroon, gold,
  // green or a stripe) and dress shoes (black, oxblood or brown)
  dress: [0xeceae4, 0xeceae4, 0xb8cce0, 0xe0c8c8, 0xc8c8c8], tie: [0x8a1e1e, 0x1e2a4a, 0x141416, 0x5a1a24, 0xb08a2a, 0x2a4a34, 'stripe'],
  dressShoe: [0x141416, 0x141416, 0x3e1a16, 0x4e2e1a],
  pants: [0x2f3238, 0x3a4a64, 0x4a3a2a, 0x6a5e44, 0x1e1e22, 0x434a36],
  shoes: ['boots', 'boots', 'blackboots', 'tanboots', 'sneakers'],
  // canvas and nylon packs (olive, coyote, khaki, black, navy, forest, grey, brown, maroon, hiking red, orange, blue,
  // teal), sleeping bags in their brighter nylons, and holsters in what they really come in: black most often, coyote,
  // tan, olive drab, ranger green, wolf grey, and brown, tan or oxblood leather
  pack: [0x5a4a34, 0x4a5236, 0x7a6a4a, 0x8a7a56, 0x2a2a2c, 0x2e3a54, 0x3a4a34, 0x55585a, 0x5e2a2a, 0x8a2e24, 0xa85a24, 0x34507a, 0x2e5a5a],
  roll: [0x7a3a2a, 0x3a5a3a, 0x5a5a6a, 0x8a6a3a, 0x6a2a3a, 0x2e4a7a, 0xa85a24, 0x4a3a6a, 0xb08a2a, 0x2a2a2c, 0x3e6e6a, 0x9a2a22],
  holster: [0x1d1d1f, 0x1d1d1f, 0x1d1d1f, 0x8a7656, 0xa08a62, 0x4e5236, 0x3e4632, 0x56585a, 0x5a3820, 0x8a5530, 0x4a2018]
};
// the work gloves Quick hands II and III put on you (player/gear.js), in the colourways real mechanic's gloves come in:
// the back (its stretch mesh), the palm and fingertips (synthetic leather), the rubber armour over the knuckles and
// fingers, the piping down the sides, the wrist strap, its logo tab, and for multicam the camo patches over the back
export const GLOVE_COLS = {
  blackRed: { back: 0x1d1e20, palm: 0x2e2f32, armor: 0x26272a, accent: 0xb3261e, strap: 0x18191a, tab: 0xd8b030 },
  blueBlack: { back: 0x2a6cc4, palm: 0x262729, armor: 0x1c1d1f, accent: 0x18191a, strap: 0x18191a, tab: 0xd8b030 },
  multicam: { back: 0x8a7a58, palm: 0x6e5f44, armor: 0x7a6a4a, accent: 0x5a5038, strap: 0x5e533c, tab: 0xd8b030, camo: [0x5e6844, 0xb4a07a, 0x6a5a40, 0x4a5236, 0x9a8660] },
  tanLeather: { back: 0xc0924e, palm: 0xb4874a, armor: 0x1e1f21, accent: 0x18191a, strap: 0x18191a, tab: 0xb02a22 },
  allBlack: { back: 0x1c1d1f, palm: 0x28292b, armor: 0x2e3033, accent: 0x36383c, strap: 0x18191a, tab: 0x3a3c40 }
};
// (held to 1 a channel: getHex doesn't clamp, so a lightened channel past full would wrap round to nearly nothing and
// a pale skin's scar come out teal)
export const shade = (c, k) => { const o = new THREE.Color(c).multiplyScalar(k); return o.setRGB(Math.min(1, o.r), Math.min(1, o.g), Math.min(1, o.b)).getHex(); };
const hsl = (h, s, l) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l).getHex();
// a top in any colour: half the time one of the stock colours for that top, otherwise a fresh, slightly worn-looking shade
const rollTopCol = top => top === 'suit' || rand() < 0.45 ? pick(LOOKS.topCol[top]) : hsl(rand(), rr(0.18, top === 'tee' ? 0.62 : 0.5), rr(0.2, top === 'tee' ? 0.62 : 0.44));
const SUIT_ODDS = 0.03;   // how often a run starts in a suit and tie (its trousers and dress shoes come with it)
// sneakers: an upper in any colour (white, grey and black come up often), a sole, and a stripe that stands out from the upper
function rollSneak() {
  const h = rand(), plain = rand() < 0.35, up = plain ? hsl(0, 0, pick([0.12, 0.45, 0.85])) : hsl(h, rr(0.35, 0.8), rr(0.28, 0.62));
  const stripe = hsl(h + rr(0.3, 0.7), rr(0.55, 0.85), rr(0.38, 0.6));
  return [up, pick([0xe8e4dc, 0xd8d2c4, 0xb08a5a, 0x2a2a2a]), stripe];
}
export const lookMats = {}, lm = c => lookMats[c] || (lookMats[c] = lam(c));
// the hair's shell, outside to outside (the head is 0.32), and how high it comes under each hat: just inside the hat's
// band, every hat wider than the hair
export const HAIR_W = { hair: 0.336, buzz: 0.328 }, HAIR_CROWN = 0.13, HAT_TUCK = { cap: 0.13, beanie: 0.105, cowboy: 0.15 };
// deal a look: anything in opt is kept as given (handy for testing), the rest is random
export function dealLook(opt) {
  const o = opt || {}, L = {};
  const near = (a, b) => { const x = new THREE.Color(a), y = new THREE.Color(b); return Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b) < 0.25; };
  L.skin = o.skin ?? pick(LOOKS.skin); L.hair = o.hair ?? pick(LOOKS.hair); L.hairStyle = o.hairStyle ?? pick(LOOKS.hairStyle);
  L.beard = o.beard ?? pick(LOOKS.beard);
  // eyes: from the list, now and then a shade of their own, and once in a while each eye a different colour
  const eyeCol = () => rand() < 0.2 ? hsl(rr(0.05, 0.6), rr(0.25, 0.55), rr(0.2, 0.42)) : pick(LOOKS.eyes);
  L.eyes = o.eyes ?? eyeCol(); L.eyes2 = o.eyes2 ?? (rand() < 0.05 ? eyeCol() : L.eyes);
  // a face of their own, a little lopsided like anyone's
  L.face = o.face ?? { eye: pick(LOOKS.eyeShape), brow: pick(LOOKS.brow), nose: pick(LOOKS.nose), mouth: pick(LOOKS.mouth), gap: rr(0.062, 0.08), eyeY: rr(0.018, 0.042), lop: rr(-0.006, 0.006),
    slit: rand() < 0.18 ? (rand() < 0.5 ? -1 : 1) : 0, scar: rand() < 0.22 ? pick(['cheek', 'brow', 'lip', 'nose']) : null, bags: rand() < 0.35, lines: rand() < 0.3, side: rand() < 0.5 ? -1 : 1,
    // and the rest that makes a face someone's: freckles, a mole, a cleft chin, big ears, the grime of the last few days,
    // or (rarely) a patch over one eye
    freckles: rand() < 0.14, mole: rand() < 0.16 ? [rr(-0.12, 0.12), rr(-0.11, 0.0)] : null, cleft: rand() < 0.15, ears: rand() < 0.2 ? 1.35 : rr(0.9, 1.1), grime: rand() < 0.3, patch: rand() < 0.04 };
  L.beardCol = o.beardCol ?? (L.hair === 0x9a948a ? 0xa8a49c : shade(L.hair, 0.9));   // (set on its own in the cheat menu's character section: ui/cheats.js)
  L.hat = o.hat ?? pick(LOOKS.hat); L.hatCol = o.hatCol ?? (L.hat === 'none' ? 0 : pick(LOOKS.hatCol[L.hat]));
  L.top = o.top ?? (rand() < SUIT_ODDS ? 'suit' : pick(LOOKS.top)); L.topCol = o.topCol ?? rollTopCol(L.top); L.print = o.print ?? (rand() < 0.5 ? pick([0xd8d2c4, 0xc8a040, 0xa83a2a, 0x2e2e30]) : 0);
  // a thermal under it now and then, never one that would vanish into the shirt over it
  L.under = o.under ?? (rand() < (LOOKS.underOdds[L.top] || 0) ? pick(LOOKS.under) : 0);
  for (let k = 0; k < 6 && o.under === undefined && L.under && near(L.under, L.topCol); k++) L.under = pick(LOOKS.under);
  if (o.under === undefined && L.under && near(L.under, L.topCol)) L.under = 0;
  const suit = L.top === 'suit';
  L.pants = o.pants ?? (suit ? L.topCol : pick(LOOKS.pants)); L.shoes = o.shoes ?? (suit ? 'dress' : pick(LOOKS.shoes));
  if (suit) { L.dress = o.dress ?? pick(LOOKS.dress); L.tie = o.tie ?? pick(LOOKS.tie); L.square = o.square ?? (rand() < 0.4 ? pick([0xeceae4, 0x8a1e1e, 0xb08a2a, 0x1e2a4a]) : 0); }
  if (L.shoes === 'dress') L.dressShoe = o.dressShoe ?? pick(LOOKS.dressShoe);
  L.sneak = o.sneak ?? rollSneak();
  // the pack and its bedroll: half the time a stock colour, otherwise a fresh muted shade (a brighter one for the bedroll)
  L.pack = o.pack ?? (rand() < 0.5 ? pick(LOOKS.pack) : hsl(rand(), rr(0.12, 0.45), rr(0.16, 0.38)));
  const rollCol = () => rand() < 0.5 ? pick(LOOKS.roll) : hsl(rand(), rr(0.3, 0.7), rr(0.24, 0.5));
  L.roll = o.roll ?? rollCol();
  // a bedroll that would vanish into the pack is dealt again
  for (let k = 0; k < 8 && o.roll === undefined && near(L.roll, L.pack); k++) L.roll = rollCol();
  L.holster = o.holster ?? pick(LOOKS.holster);
  L.glove = o.glove ?? pick(Object.keys(GLOVE_COLS));
  L.wrist = o.wrist ?? dealWrists();
  if (o.own) L.own = o.own;   // (what's been set by hand in the cheat menu's character section, to keep: ui/cheats.js)
  return L;
}
// ---- on the wrists, now and then: a watch, a chain, beads, a rubber band or two, a leather cuff, a paracord band or
// braided strings. Each wrist gets something WRIST_ODDS of the time, never the same kind as the other wrist, in colours
// of its own; a watch is now and then gold (WATCH_GOLD) or, rarer still, iced out with diamonds round the bezel
// (WATCH_ICE). Built by buildWrists
export const WRIST_KINDS = ['watch', 'watch', 'chain', 'beads', 'band', 'cuff', 'paracord', 'string'], WRIST_ODDS = 0.3, WATCH_GOLD = 0.08, WATCH_ICE = 0.03;
const METALS = { steel: 0xb8bcc0, gold: 0xd4a83a, rose: 0xc88a6a, gun: 0x4a4c50, black: 0x202124, platinum: 0xe2e4e8 };
const LEATHERS = [0x4a2e1c, 0x2a1c14, 0x6a4226, 0x1a1a1c, 0x7a5a3a];
export function dealWrist(kind) {
  const muted = () => hsl(rand(), rr(0.15, 0.5), rr(0.15, 0.4)), bright = () => hsl(rand(), rr(0.55, 0.9), rr(0.4, 0.6));
  switch (kind) {
    case 'watch': {
      const r = rand(), style = r < WATCH_ICE ? 'ice' : r < WATCH_ICE + WATCH_GOLD ? 'gold' : pick(['field', 'field', 'sport', 'digital', 'leather', 'steel']);
      const metal = style === 'gold' ? METALS.gold : style === 'ice' ? pick([METALS.platinum, METALS.platinum, METALS.gold]) : style === 'sport' || style === 'digital' ? METALS.black : pick([METALS.steel, METALS.steel, METALS.gun, METALS.gold, METALS.rose]);
      const strap = style === 'sport' ? bright() : style === 'field' ? muted() : style === 'leather' ? pick(LEATHERS) : style === 'digital' ? (rand() < 0.6 ? pick([0x1c1c1e, 0x2a3a2a, 0x3a3a40]) : bright()) : metal;
      const face = style === 'digital' ? 0x9aa88a : style === 'gold' ? pick([0xe8d8a8, 0x1c1c1e, 0x2a3a5a]) : style === 'ice' ? pick([0xeaf2f8, 0x1a1c22, 0x2a4a7a]) : pick([0xece8de, 0xece8de, 0x1c1c1e, 0x2a3a5a, 0x2e4a32, bright()]);
      return { kind, style, metal, strap, face, turn: rr(0, Math.PI * 2), turn2: rr(0, Math.PI * 2) };
    }
    case 'chain': return { kind, metal: pick([METALS.steel, METALS.steel, METALS.gold, METALS.rose, METALS.gun]) };
    case 'beads': { const c = rand() < 0.4 ? pick([0x6a4426, 0x2a2a2e, 0xd8d0c0, 0x8a6a4a]) : bright(), mixed = rand() < 0.5; return { kind, cols: Array.from({ length: 24 }, (_, k) => mixed ? (rand() < 0.5 ? c : bright()) : k % 4 === 3 ? shade(c, 0.6) : c) }; }
    case 'band': return { kind, col: bright(), col2: rand() < 0.35 ? bright() : 0 };
    case 'cuff': return { kind, col: rand() < 0.6 ? pick(LEATHERS) : muted(), metal: pick([METALS.steel, METALS.gold, METALS.gun]) };
    case 'paracord': return { kind, col: rand() < 0.5 ? pick([0x4a5236, 0x8a7656, 0x1c1c1e, 0xc0302a]) : bright(), col2: rand() < 0.5 ? 0 : bright() };
    default: return { kind, cols: [bright(), bright(), bright()] };
  }
}
function dealWrists() {
  const w = { L: null, R: null };
  for (const s of rand() < 0.5 ? ['L', 'R'] : ['R', 'L']) {
    if (rand() >= WRIST_ODDS) continue;
    const other = w[s === 'L' ? 'R' : 'L']; let k;
    do k = pick(WRIST_KINDS); while (other && k === other.kind);
    w[s] = dealWrist(k);
  }
  return w;
}
// the shirt colours, unless body armour's canvas jacket is covering it (build-weapons.js calls this too)
export function shirtColours(jacket) {
  const c = jacket ? 0x7a6a4a : (LOOK.cur ? LOOK.cur.topCol : 0x4e5a3c);
  PM.mats.shirt.color.setHex(c); PM.mats.shirtDk.color.setHex(jacket ? 0x5e5036 : shade(c, 0.76));
}
// clear the old look and build a new one; attach is false only for the first build, before the x-ray rim exists
export function rollLook(opt) {
  const L = LOOK.cur = dealLook(opt);
  Object.values(LOOK.g).forEach(g => { while (g.children.length) { const c = g.children[0]; g.remove(c); c.traverse(o => { if (o.isMesh && o.userData.fine) o.geometry.dispose(); }); } });
  PM.mats.skin.color.setHex(L.skin); PM.mats.skinDk.color.setHex(shade(L.skin, 0.86)); PM.mats.pants.color.setHex(L.pants);
  shirtColours(false);   // a fresh run has no armour yet; buildGuns puts the jacket on later if you earn one
  PACK.canvas.color.setHex(L.pack); PACK.canvasDk.color.setHex(shade(L.pack, 0.78)); PACK.canvasLt.color.setHex(shade(L.pack, 1.22)); PACK.roll.color.setHex(L.roll);
  const sils = buildLook(L);
  // pull flush faces apart, then fold each group's small pieces into a few meshes
  const pieces = new Set(); Object.values(LOOK.g).forEach(g => g.traverse(o => { if (o.isMesh) pieces.add(o); }));
  unfight(PM.g, { only: pieces, fixed: new Set([PM.torso, PM.head, PM.armL, PM.armR, PM.legL, PM.legR, PM.shinL, PM.shinR]) });
  const live = { live: new Set([PM.mats.shirt, PM.mats.shirtDk, PM.mats.skin, PM.mats.skinDk, PM.mats.pants]) };
  const faceParts = new Set(faceGroups(LOOK.g.head));   // (kept whole, so they can move: faceMood)
  Object.values(LOOK.g).forEach(g => mergeInto(g, finePieces(g, faceParts), live));
  // the hat's big pieces keep the faint rim and the see-through silhouette like the rest of you
  sils.forEach(m => outline(m, 0, 0, 0.01, pOutline));
  if (LOOK.xrayReady) xrayAttach(sils);
  trimShadows(PM.g);
}
// the pieces built on H since its n'th child, moved into a group pivoted at (x, y, z) on the face so they can turn and
// squash as one (faceMood); s is the side, -1 left, 1 right, 0 the middle (at most the first `most` of them)
function facePart(H, n, x, y, z, s, most = 99) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.userData.s = s;
  H.children.slice(n, n + most).forEach(c => { c.position.x -= x; c.position.y -= y; c.position.z -= z; g.add(c); });
  H.add(g); return g;
}
export function faceGroups(H) { const f = H.userData.face; return f ? [...f.eyes, ...f.brows, f.mouth].filter(Boolean) : []; }
// Firing for a while sets your face: the brows come down, their inner ends lower, the eyes narrow and the mouth tightens
// into a grimace; a = 0 (calm) to 1. ANIM.anger drives it (player/animation.js). The trigger clicking on an empty gun
// gives a start, w = 0 to 1 (ANIM.worry): the brows jump up with their inner ends raised in a worried tilt, the eyes
// go wide and the jaw drops, the mouth open in a little O; that closes first (w squared) as the face eases back, so
// the worried brows are the last of it to go. A hit hurts (h, ANIM.hurt): the brows pinched down with their inner ends
// up, the eyes screwed shut and the mouth pulled wide over clenched teeth. And aiming down the sights (k, ANIM.ads) the
// left eye shuts and the right one squints along the gun
const ANGER = { browDrop: 0.012, browTilt: 0.34, squint: 0.42, mouthW: 0.82, mouthH: 2.1 };
const WORRY = { browLift: 0.02, browTilt: 0.38, widen: 0.75, mouthW: 0.5, mouthH: 4.5, jaw: 0.009 };
const HURT_FX = { browDrop: 0.01, browTilt: 0.32, squeeze: 0.8, mouthW: 1.4, mouthH: 0.55 };
const AIM_FX = { shut: 0.92, squint: 0.4 };
export function faceMood(H, a, w = 0, h = 0, k = 0) {
  const f = H.userData.face; if (!f || (f.a === a && f.w === w && f.h === h && f.k === k)) return; f.a = a; f.w = w; f.h = h; f.k = k;
  const o = w * w;
  f.brows.forEach(g => { if (g.userData.y0 === undefined) g.userData.y0 = g.position.y; g.position.y = g.userData.y0 - ANGER.browDrop * a + WORRY.browLift * w - HURT_FX.browDrop * h; g.rotation.z = g.userData.s * (ANGER.browTilt * a - WORRY.browTilt * w - HURT_FX.browTilt * h); });
  f.eyes.forEach(g => { g.scale.y = Math.max(0.07, 1 - ANGER.squint * a + WORRY.widen * w - HURT_FX.squeeze * h - (g.userData.s < 0 ? AIM_FX.shut : AIM_FX.squint) * k); });
  const m = f.mouth; if (!m) return;
  if (m.userData.y0 === undefined) m.userData.y0 = m.position.y;
  m.position.y = m.userData.y0 - WORRY.jaw * o;
  m.scale.set((1 - (1 - ANGER.mouthW) * a) * (1 - (1 - WORRY.mouthW) * o) * (1 + (HURT_FX.mouthW - 1) * h), (1 + (ANGER.mouthH - 1) * a) * (1 + (WORRY.mouthH - 1) * o) * (1 + (HURT_FX.mouthH - 1) * h), 1);
}
export function buildLook(L) {
  const H = LOOK.g.head, HT = LOOK.g.hat, TO = LOOK.g.torso, sils = [], sil = m => { m.userData.sil = true; sils.push(m); return m; };
  const hair = lm(L.hair), beard = lm(L.beardCol), skinDk = PM.mats.skinDk, shirt = PM.mats.shirt, shirtDk = PM.mats.shirtDk;
  // ---- face: eyes, brows, nose, mouth and ears, each dealt one of a few shapes (L.face), set a little unevenly
  const F = L.face, brow = L.hairStyle === 'bald' ? beard : hair, dark = lm(0x141010), white = lm(0xe2dccf), scarM = lm(shade(L.skin, 1.16)), circ = lm(shade(L.skin, 0.68));
  const face = H.userData.face = { eyes: [], brows: [], mouth: null };
  [-1, 1].forEach(s => {
    const x = s * F.gap, y = F.eyeY + (s > 0 ? F.lop : 0), eyeM = lm(s > 0 ? L.eyes2 || L.eyes : L.eyes), n0 = H.children.length;
    if (F.patch && s === F.side) {   // a patch over this eye, its strap round the head
      box(H, 0.064, 0.056, 0.014, dark, x, y, 0.164); box(H, 0.34, 0.012, 0.008, dark, 0, y + 0.04, 0.163).rotation.z = -s * 0.22;
      [-1, 1].forEach(q => box(H, 0.006, 0.012, 0.32, dark, q * 0.163, y + 0.04 + q * s * 0.036, 0));
    }
    else if (F.eye === 'beady') { box(H, 0.026, 0.03, 0.012, eyeM, x, y, 0.162); box(H, 0.012, 0.016, 0.012, dark, x - s * 0.003, y, 0.165); }   // small dark eyes, no whites
    else if (F.eye === 'narrow' || (F.eye === 'oneSquint' && s === F.side)) { box(H, 0.05, 0.016, 0.012, white, x, y, 0.162); box(H, 0.022, 0.016, 0.012, dark, x - s * 0.004, y, 0.165); }   // a squint
    else if (F.eye === 'droopy') {   // the outer corners lower, the lids heavy
      const e = box(H, 0.05, 0.026, 0.012, white, x, y, 0.162); e.rotation.z = s * -0.22; box(H, 0.022, 0.024, 0.012, eyeM, x - s * 0.004, y, 0.164); box(H, 0.011, 0.013, 0.012, dark, x - s * 0.004, y, 0.167);
      box(H, 0.058, 0.012, 0.014, PM.mats.skinDk, x, y + 0.012, 0.169).rotation.z = s * -0.22;
    }
    else if (F.eye === 'deepset') {   // sunk under the brow, in its shadow
      box(H, 0.064, 0.016, 0.014, circ, x, y + 0.02, 0.163); box(H, 0.044, 0.024, 0.01, white, x, y, 0.161); box(H, 0.02, 0.022, 0.01, eyeM, x - s * 0.004, y, 0.163); box(H, 0.01, 0.012, 0.01, dark, x - s * 0.004, y, 0.165);
    }
    else {
      const h = F.eye === 'wide' ? 0.036 : 0.03;
      box(H, 0.05, h, 0.012, white, x, y, 0.162); box(H, 0.024, h - 0.002, 0.012, eyeM, x - s * 0.004, y, 0.164); box(H, 0.012, h * 0.5, 0.012, dark, x - s * 0.004, y, 0.167);
      if (F.eye === 'tired') { box(H, 0.056, 0.014, 0.014, PM.mats.skinDk, x, y + h / 2 - 0.004, 0.169); box(H, 0.05, 0.012, 0.01, circ, x, y - h / 2 - 0.008, 0.162); }   // heavy lids, dark circles under
    }
    if (F.bags) box(H, 0.046, 0.007, 0.012, PM.mats.skinDk, x, y - 0.026, 0.163);
    if (!(F.patch && s === F.side)) face.eyes.push(facePart(H, n0, x, y, 0.165, s));   // (a patch doesn't narrow)
    const n1 = H.children.length;
    // brows: flat, raised at the middle, drawn down in a frown, heavy or thin; sometimes one with a slit shaved in it
    const by = y + (F.eye === 'tired' || F.eye === 'deepset' ? 0.04 : 0.046) + (F.brow === 'skeptic' && s === F.side ? 0.014 : 0);
    const bh = F.brow === 'heavy' || F.brow === 'bushy' ? 0.03 : F.brow === 'thin' || F.brow === 'sparse' ? 0.012 : F.brow === 'unibrow' ? 0.022 : 0.02, bw = F.brow === 'heavy' || F.brow === 'bushy' ? 0.088 : F.brow === 'sparse' ? 0.058 : 0.076;
    const tilt = F.brow === 'raised' ? s * 0.16 : F.brow === 'furrow' || F.brow === 'unibrow' ? s * -0.2 : F.brow === 'skeptic' ? (s === F.side ? s * 0.12 : s * -0.1) : s * -0.04;
    if (F.brow === 'unibrow' && s === 1) box(H, F.gap * 2 - 0.05, bh * 0.8, 0.02, brow, 0, by - 0.006, 0.165);   // joined over the nose
    if (F.brow === 'arched') {   // up from the inside to a peak, then down
      box(H, bw * 0.55, bh, 0.02, brow, x - s * bw * 0.2, by, 0.165).rotation.z = s * 0.28; box(H, bw * 0.5, bh, 0.02, brow, x + s * bw * 0.25, by + 0.004, 0.165).rotation.z = s * -0.32;
    } else if (F.slit === s) {   // two pieces with skin between, off-centre toward the outside
      const g = 0.012, a = (bw - g) * 0.62, b = bw - g - a;
      const p1 = box(H, a, bh, 0.02, brow, x - s * (bw / 2 - a / 2), by + (F.brow === 'furrow' ? -0.004 : 0.003), 0.165), p2 = box(H, b, bh, 0.02, brow, x + s * (bw / 2 - b / 2), by - (F.brow === 'furrow' ? -0.006 : 0.004), 0.165);
      p1.rotation.z = p2.rotation.z = tilt;
    } else box(H, bw, bh, 0.02, brow, x, by, 0.165).rotation.z = tilt;
    if (F.brow === 'bushy') box(H, 0.02, 0.014, 0.02, brow, x - s * 0.03, by + 0.018, 0.166).rotation.z = s * 0.5;   // a wild tuft at the inner end
    face.brows.push(facePart(H, n1, x, by, 0.165, s));
    box(H, 0.03 * F.ears, 0.08 * F.ears, 0.07, PM.mats.skinDk, s * (0.172 + 0.012 * (F.ears - 1)), 0.0, -0.01);   // ears
  });
  // the nose: small, long, wide, broken and set crooked, a button or hooked
  const NOSE = { small: [0.04, 0.05, 0.035, -0.03], long: [0.042, 0.08, 0.04, -0.038], wide: [0.068, 0.05, 0.04, -0.036], crooked: [0.044, 0.066, 0.04, -0.034], button: [0.036, 0.034, 0.034, -0.042], hooked: [0.044, 0.07, 0.046, -0.032] };
  const N = NOSE[F.nose] || NOSE.small, nose = box(H, N[0], N[1], N[2], PM.mats.skinDk, F.nose === 'crooked' ? F.side * 0.008 : 0, N[3], 0.16 + N[2] / 2);
  if (F.nose === 'crooked') nose.rotation.z = F.side * 0.16;
  if (F.nose === 'hooked') box(H, N[0] * 0.8, 0.02, 0.02, PM.mats.skinDk, 0, N[3] + N[1] / 2 - 0.012, 0.19);   // the bridge's bump
  if (F.lines) [0.104, 0.122].forEach((y, k) => box(H, 0.12 - k * 0.03, 0.006, 0.01, PM.mats.skinDk, F.lop * 3, y, 0.161));   // lines across the forehead
  // a scar: down a cheek, through a brow, through the lip or across the nose
  if (F.scar === 'cheek') box(H, 0.009, 0.075, 0.01, scarM, F.side * 0.1, -0.035, 0.163).rotation.z = F.side * 0.3;
  else if (F.scar === 'brow') box(H, 0.009, 0.07, 0.024, scarM, F.side * (F.gap + 0.012), F.eyeY + 0.045, 0.166).rotation.z = F.side * 0.15;
  else if (F.scar === 'nose') box(H, 0.06, 0.008, 0.012, scarM, 0, N[3] + 0.01, 0.16 + N[2] + 0.002).rotation.z = F.side * 0.25;
  if (F.freckles) { const fr = lm(shade(L.skin, 0.74)); [[-0.1, -0.02], [-0.085, -0.04], [-0.115, -0.045], [0.1, -0.025], [0.088, -0.045], [0.118, -0.04], [-0.02, -0.012], [0.024, -0.016]].forEach(([fx, fy]) => box(H, 0.008, 0.008, 0.006, fr, fx, fy, 0.1615)); }
  if (F.mole) box(H, 0.012, 0.012, 0.008, lm(shade(L.skin, 0.5)), F.mole[0], F.mole[1], 0.1625);
  if (F.cleft) box(H, 0.006, 0.026, 0.006, PM.mats.skinDk, 0, -0.145, 0.1615);
  if (F.grime) { const gr = lm(new THREE.Color(L.skin).multiplyScalar(0.62).lerp(new THREE.Color(0x3a3020), 0.35).getHex()); box(H, 0.05, 0.03, 0.006, gr, F.side * 0.095, -0.06, 0.1612).rotation.z = 0.3; box(H, 0.04, 0.016, 0.006, gr, -F.side * 0.06, 0.12, 0.1612); }
  // ---- hair: short, long, buzzed or none, as one shell round the back and sides of the head (HAIR_W across, a few mm
  // proud of it) that runs up into a top over the crown when there's no hat (or only a bandana, worn as a headband
  // round it). Under a hat the shell stops tucked just inside the hat's band (HAT_TUCK), narrower than every hat, so
  // the hair shows below it all the way round and nothing of it comes through the hat or flickers against it
  const top = L.hat === 'none' || L.hat === 'bandana';
  const hairTop = L.hairStyle === 'bald' ? 0.16 : top ? (L.hairStyle === 'buzz' ? 0.168 : 0.195) : 0.16;
  if (L.hairStyle !== 'bald') {
    const buzz = L.hairStyle === 'buzz', hw = buzz ? HAIR_W.buzz : HAIR_W.hair, up = top ? HAIR_CROWN : HAT_TUCK[L.hat], d = 0.02 + (hw - 0.32) / 2;   // (each piece runs a way into the head, so nothing's flush with it)
    const lo = buzz ? -0.02 : -0.05, sideLo = buzz ? 0.0 : -0.03;
    box(H, hw, up - lo, d, hair, 0, (up + lo) / 2, -hw / 2 + d / 2);                                        // the back, up to the top
    [-1, 1].forEach(sg => {
      const z0 = -hw / 2 + d, z1 = -0.035;   // (from where the back ends, so their faces meet rather than overlap)
      box(H, d, up - sideLo, z1 - z0, hair, sg * (hw / 2 - d / 2), (up + sideLo) / 2, (z0 + z1) / 2);        // the sides, behind the ears
      box(H, d, up - 0.05, 0.115, hair, sg * (hw / 2 - d / 2), (up + 0.05) / 2, z1 + 0.0575);                 // and above them, to the temples
    });
    if (top) {
      box(H, hw, hairTop - HAIR_CROWN, hw, hair, 0, (hairTop + HAIR_CROWN) / 2, 0);                           // over the crown, from where the back and sides stop (meeting them edge to edge, not overlapping)
      if (!buzz) box(H, 0.3, 0.045, 0.03, hair, 0.02, 0.15, 0.17).rotation.z = 0.06;                          // the fringe
    }
    if (L.hairStyle === 'long') {
      // long hair falls past the collar behind, and down the sides behind the ears (below any hat's band)
      const ly = Math.min(up, 0.09);
      box(H, hw + 0.012, ly + 0.15, 0.06, hair, 0, (ly - 0.15) / 2, -hw / 2 - 0.006 + 0.03);
      [-1, 1].forEach(sg => box(H, 0.02, ly + 0.11, 0.14, hair, sg * (hw / 2 - 0.004), (ly - 0.11) / 2, -0.09));
    }
  }
  // ---- facial hair, then the mouth over it. Stubble is shadow, the skin and the hair mixed, not a solid block of hair
  const stub = k => lm(new THREE.Color(L.skin).lerp(new THREE.Color(L.beardCol), k).getHex());
  const bd = L.beard, jaw = (m, h) => { box(H, 0.3, h, 0.024, m, 0, -0.16 + h / 2, 0.166); [-1, 1].forEach(s => box(H, 0.014, 0.13, 0.12, m, s * 0.166, -0.08, 0.06)); };
  const tache = (w, y) => box(H, w, 0.026, 0.026, beard, 0, y ?? -0.072, 0.174);
  const chin = (w, h, y) => box(H, w, h, 0.032, beard, 0, y, 0.168);
  if (bd === 'stubble' || bd === 'heavyStubble') { const m = stub(bd === 'stubble' ? 0.38 : 0.62); jaw(m, 0.085); box(H, 0.11, 0.022, 0.022, m, 0, -0.074, 0.168); }
  else if (bd === 'full' || bd === 'longBeard') {
    jaw(beard, 0.13); tache(0.14);
    if (bd === 'longBeard') { box(H, 0.24, 0.1, 0.05, beard, 0, -0.205, 0.15); box(H, 0.16, 0.06, 0.045, beard, 0, -0.27, 0.14); }
  }
  else if (bd === 'mustache') tache(0.13);
  else if (bd === 'handlebar') { tache(0.1); [-1, 1].forEach(s => box(H, 0.05, 0.016, 0.024, beard, s * 0.07, -0.064, 0.174).rotation.z = s * 0.5); }   // waxed ends curling up
  else if (bd === 'horseshoe') { tache(0.13); [-1, 1].forEach(s => box(H, 0.022, 0.07, 0.026, beard, s * 0.056, -0.11, 0.172)); }
  else if (bd === 'goatee') { chin(0.1, 0.07, -0.135); tache(0.12); }
  else if (bd === 'vandyke') { chin(0.07, 0.06, -0.14); tache(0.12, -0.07); }
  else if (bd === 'soulPatch') chin(0.03, 0.03, -0.122);
  else if (bd === 'chinstrap') { [-1, 1].forEach(s => box(H, 0.014, 0.15, 0.11, beard, s * 0.166, -0.085, 0.06)); box(H, 0.3, 0.026, 0.026, beard, 0, -0.152, 0.168); }
  else if (bd === 'muttonChops') { [-1, 1].forEach(s => { box(H, 0.014, 0.16, 0.13, beard, s * 0.166, -0.06, 0.055); box(H, 0.07, 0.1, 0.024, beard, s * 0.12, -0.075, 0.166); }); tache(0.1, -0.074); }   // the chin left bare
  else if (bd === 'sideburns') [-1, 1].forEach(s => box(H, 0.014, 0.1, 0.06, beard, s * 0.166, -0.02, 0.07));
  // the mouth: no lips, just the line of it, dark and all but flush with the face (in front of a full beard): plain,
  // thin, turned down, a smirk up at one corner, or set grim with the chin creased under it
  const mY = -0.098, mZ = bd === 'full' || bd === 'longBeard' ? 0.187 : 0.1615, mouthM = lm(new THREE.Color(L.skin).multiplyScalar(0.48).lerp(new THREE.Color(0x4a1e18), 0.3).getHex());
  const mw = F.mouth === 'thin' ? 0.046 : 0.058, mh = F.mouth === 'thin' ? 0.005 : 0.008, mx = F.mouth === 'smirk' ? -F.side * 0.005 : 0, n2 = H.children.length;
  box(H, mw, mh, 0.004, mouthM, mx, mY, mZ);
  if (F.mouth === 'frown') [-1, 1].forEach(s => box(H, 0.012, 0.006, 0.004, mouthM, s * (mw / 2 + 0.003), mY - 0.005, mZ).rotation.z = s * 0.6);
  else if (F.mouth === 'smirk') box(H, 0.016, 0.006, 0.004, mouthM, mx + F.side * (mw / 2 + 0.005), mY + 0.004, mZ).rotation.z = F.side * 0.55;
  else if (F.mouth === 'grim') box(H, 0.034, 0.005, 0.004, PM.mats.skinDk, 0, mY - 0.026, mZ);   // the chin set under it
  face.mouth = facePart(H, n2, 0, mY, mZ, 0, F.mouth === 'grim' ? 1 : 3);   // (the line and its corners; the chin's crease stays put)
  if (F.scar === 'lip') box(H, 0.007, 0.04, 0.004, scarM, F.side * 0.02, mY + 0.004, mZ + 0.001);
  // ---- hat
  const hc = L.hatCol, hcDk = lm(shade(hc, 0.72));
  if (L.hat === 'cap') {
    sil(box(HT, 0.35, 0.1, 0.36, lm(hc), 0, 0.17, -0.005));
    box(HT, 0.355, 0.026, 0.365, hcDk, 0, 0.126, -0.005); box(HT, 0.06, 0.024, 0.06, hcDk, 0, 0.23, -0.005);
    box(HT, 0.11, 0.06, 0.012, lm(hc === 0xb09060 ? 0x5a4a34 : 0xe6d6b0), 0, 0.172, 0.178);
    const brim = sil(box(HT, 0.3, 0.032, 0.17, lm(hc), 0, 0.128, 0.255)); brim.rotation.x = 0.14;
    box(brim, 0.294, 0.008, 0.164, hcDk, 0, -0.019, 0);
    LOOK.mirrorY = 0.214;
  } else if (L.hat === 'beanie') {
    sil(box(HT, 0.344, 0.12, 0.352, lm(hc), 0, 0.168, 0));
    box(HT, 0.352, 0.046, 0.36, hcDk, 0, 0.11, 0);
    if (rand() < 0.4) { const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), hcDk); pom.position.y = 0.25; pom.castShadow = true; HT.add(pom); }
    LOOK.mirrorY = 0.235;
  } else if (L.hat === 'cowboy') {
    sil(box(HT, 0.5, 0.018, 0.46, lm(hc), 0, 0.138, 0));
    sil(box(HT, 0.35, 0.13, 0.35, lm(hc), 0, 0.205, 0));                                     // the crown, round the head and its hair
    box(HT, 0.356, 0.026, 0.356, hcDk, 0, 0.157, 0); box(HT, 0.08, 0.012, 0.24, hcDk, 0, 0.266, 0);
    [-1, 1].forEach(s => box(HT, 0.05, 0.022, 0.452, lm(hc), s * 0.235, 0.155, 0).rotation.z = s * 0.45);   // the brim's sides curl up
    LOOK.mirrorY = 0.16;
  } else if (L.hat === 'bandana') {
    sil(box(HT, 0.338, 0.05, 0.338, lm(hc), 0, 0.102, 0));
    box(HT, 0.06, 0.05, 0.04, hcDk, 0, 0.1, -0.185);
    [-1, 1].forEach(s => box(HT, 0.03, 0.09, 0.012, lm(hc), s * 0.02, 0.04, -0.19).rotation.z = s * 0.25);
    LOOK.mirrorY = hairTop + 0.02;
  } else LOOK.mirrorY = hairTop + 0.02;
  // ---- top: a work shirt, a tee, a flannel, a hoodie, a polo (short sleeved or long) or, rarely, a suit and tie
  const sleeve = (len, cuff) => [LOOK.g.armL, LOOK.g.armR].forEach(a => {
    box(a, 0.156, 0.156, len, shirt, 0, 0, -0.03 + len / 2);
    if (cuff) box(a, cuff[0], cuff[0], cuff[1], shirtDk, 0, 0, -0.03 + len - cuff[1] / 2 + cuff[2]);
  });
  // a thermal under it: long sleeves on to the wrist (WRIST) under the shirt's, in the shirt's own colour so the sleeves
  // read as the shirt's, with a ribbed cuff and a few rows of the knit; the thermal itself shows at the open collar, a
  // henley's two buttons in it
  const WRIST = 0.43;
  if (L.under) {
    const th = lm(L.under), thDk = lm(shade(L.under, 0.86));
    [LOOK.g.armL, LOOK.g.armR].forEach(a => {
      box(a, 0.15, 0.15, WRIST + 0.024, shirt, 0, 0, -0.024 + (WRIST + 0.024) / 2);   // (its back end tucked a hair inside the shirt's, so it never shows through at the back of the arm)
      box(a, 0.153, 0.153, 0.035, shirtDk, 0, 0, WRIST - 0.018);
      [0.24, 0.3, 0.36].forEach(z => box(a, 0.152, 0.152, 0.006, shirtDk, 0, 0, z));
    });
    if (L.top === 'work' || L.top === 'flannel') { box(TO, 0.1, 0.06, 0.008, th, 0, 0.27, 0.152); [0.282, 0.258].forEach(y => box(TO, 0.012, 0.012, 0.006, thDk, 0, y, 0.158)); }
    else box(TO, 0.2, 0.014, 0.05, th, 0, 0.306, 0.13);   // a band of it above a crew neck or a polo's collar
  }
  if (L.top === 'work' || L.top === 'flannel') {
    [-1, 1].forEach(s => box(TO, 0.12, 0.04, 0.08, shirtDk, s * 0.07, 0.295, 0.125).rotation.y = s * 0.35);
    // buttoned to the top, or open at the neck over the thermal
    box(TO, 0.05, L.under ? 0.44 : 0.5, 0.016, shirtDk, 0, L.under ? -0.03 : 0.0, 0.157);
    for (let k = L.under ? 1 : 0; k < 4; k++) box(TO, 0.022, 0.022, 0.012, lm(0xe6d6b0), 0, 0.19 - k * 0.12, 0.168);
    box(TO, 0.085, 0.085, 0.016, shirtDk, -0.07, 0.03, 0.157); box(TO, 0.09, 0.022, 0.018, shirt, -0.07, 0.07, 0.161);
  }
  if (L.top === 'work') sleeve(0.16, [0.168, 0.04, 0.02]);
  else if (L.top === 'flannel') {
    // a dark check across the front, back and sides, and rolled-up long sleeves with a stripe
    const pl = lm(shade(L.topCol, 0.45));
    [-0.19, -0.1, 0.1, 0.19].forEach(x => [-1, 1].forEach(sg => box(TO, 0.02, 0.6, 0.008, pl, x, 0, sg * 0.153)));
    [-0.15, 0.0, 0.15].forEach(y => { [-1, 1].forEach(sg => box(TO, 0.496, 0.02, 0.008, pl, 0, y, sg * 0.153)); [-1, 1].forEach(sg => box(TO, 0.008, 0.02, 0.296, pl, sg * 0.253, y, 0)); });
    sleeve(0.3, [0.17, 0.045, 0.012]);
    [LOOK.g.armL, LOOK.g.armR].forEach(a => box(a, 0.159, 0.159, 0.02, pl, 0, 0, 0.1));
  } else if (L.top === 'tee') {
    box(TO, 0.2, 0.03, 0.05, shirtDk, 0, 0.29, 0.13);
    if (L.print) box(TO, 0.12, 0.09, 0.01, lm(L.print), 0, 0.08, 0.157);
    sleeve(0.15, [0.16, 0.02, 0.015]);
  } else if (L.top === 'hoodie') {
    box(TO, 0.34, 0.1, 0.12, shirt, 0, 0.32, -0.1);                                       // the hood, bunched behind your neck
    box(TO, 0.3, 0.13, 0.016, shirtDk, 0, -0.17, 0.157);                                 // the front pocket
    [-1, 1].forEach(s => box(TO, 0.012, 0.11, 0.01, lm(0xd8d2c4), s * 0.05, 0.22, 0.157));   // drawstrings
    sleeve(0.46, [0.164, 0.04, 0.006]);
  } else if (L.top === 'polo' || L.top === 'poloLong') {
    // a knit collar lying flat with a tipped edge, a three-button placket, now and then a little logo on the chest, and
    // ribbed bands at the sleeves (short) or cuffs at the wrists (long)
    const tip = lm(shade(L.topCol, L.topCol === 0xd8d4cc ? 0.7 : 0.62));
    [-1, 1].forEach(s => { const c = box(TO, 0.11, 0.03, 0.075, shirt, s * 0.062, 0.3, 0.12); c.rotation.y = s * 0.4; c.rotation.z = -s * 0.12; box(c, 0.112, 0.006, 0.077, tip, 0, 0.012, 0); });
    box(TO, 0.034, 0.12, 0.012, shirtDk, 0, 0.225, 0.154);
    [0.26, 0.215, 0.17].forEach(y => box(TO, 0.014, 0.014, 0.008, lm(L.topCol === 0xd8d4cc ? 0xbab4a8 : 0xe6e0d4), 0, y, 0.161));
    if (L.print) box(TO, 0.028, 0.022, 0.008, lm(L.print), 0.075, 0.215, 0.153);
    if (L.top === 'polo') sleeve(0.17, [0.162, 0.028, 0.004]); else sleeve(0.46, [0.16, 0.04, 0.004]);
  } else if (L.top === 'suit') {
    // the jacket is the shirt colour (so body armour's canvas still goes over it); in the V of its lapels a dress shirt
    // and a tie, knotted at the collar and tucked in where the jacket buttons; a breast pocket (a square in it sometimes),
    // flap pockets, two buttons, and the shirt's cuffs showing at the wrists
    const ds = lm(L.dress), dsDk = lm(shade(L.dress, 0.84));
    box(TO, 0.15, 0.24, 0.006, ds, 0, 0.18, 0.152);
    [-1, 1].forEach(s => { box(TO, 0.075, 0.3, 0.014, shirtDk, s * 0.072, 0.16, 0.156).rotation.z = -s * 0.3; box(TO, 0.052, 0.026, 0.01, ds, s * 0.028, 0.288, 0.157).rotation.z = s * 0.55; });
    if (L.tie === 'stripe') {
      const a = lm(0x1e2a4a), b = lm(0x8a1e1e);
      box(TO, 0.032, 0.028, 0.012, a, 0, 0.27, 0.16); box(TO, 0.042, 0.19, 0.008, a, 0, 0.15, 0.157);
      for (let k = 0; k < 5; k++) box(TO, 0.044, 0.01, 0.006, b, 0, 0.23 - k * 0.04, 0.161).rotation.z = 0.5;
    } else { const t = lm(L.tie); box(TO, 0.032, 0.028, 0.012, t, 0, 0.27, 0.16); box(TO, 0.04, 0.19, 0.008, t, 0, 0.15, 0.157); box(TO, 0.008, 0.16, 0.004, lm(shade(L.tie, 0.7)), 0, 0.15, 0.161); }
    [0.03, -0.07].forEach(y => box(TO, 0.022, 0.022, 0.01, lm(0x18181a), 0, y, 0.155));
    box(TO, 0.07, 0.008, 0.01, shirtDk, 0.19, 0.17, 0.153);
    if (L.square) box(TO, 0.04, 0.018, 0.008, lm(L.square), 0.19, 0.182, 0.155);
    [-1, 1].forEach(s => box(TO, 0.1, 0.02, 0.012, shirtDk, s * 0.15, -0.14, 0.154));
    sleeve(WRIST - 0.01, null);
    [LOOK.g.armL, LOOK.g.armR].forEach(a => { box(a, 0.15, 0.15, 0.03, ds, 0, 0, WRIST - 0.03); box(a, 0.152, 0.152, 0.006, dsDk, 0, 0, WRIST - 0.018); });
  }
  // ---- trousers: a cargo pocket on one thigh and a knee patch on the other
  const pDk = lm(shade(L.pants, 0.7));
  if (L.top === 'suit') [[LOOK.g.legL, LOOK.g.shinL], [LOOK.g.legR, LOOK.g.shinR]].forEach(([l, sh]) => { const m = lm(shade(L.pants, 0.8)); box(l, 0.008, 0.25, 0.006, m, 0, -0.155, 0.112); box(sh, 0.008, 0.21, 0.006, m, 0, -0.385, 0.108); });   // a suit's: pressed, a crease down the front of each thigh and shin
  else {
    box(LOOK.g.legL, 0.012, 0.13, 0.12, PM.mats.pants, -0.1, -0.2, 0.0); box(LOOK.g.legL, 0.016, 0.03, 0.13, pDk, -0.101, -0.14, 0.0);
    box(LOOK.g.legR, 0.11, 0.09, 0.012, pDk, 0.01, -0.28, 0.114);
  }
  // ---- shoes: laced work boots (brown, black or tan), sneakers, or a suit's dress shoes
  const SH = { boots: [0x3e2e22, 0x1e1a16, 0x8a7a5a], blackboots: [0x1e1e20, 0x121212, 0x3a3a3a], tanboots: [0x7a5a3a, 0x2a2018, 0x4a3a2a] };
  [LOOK.g.shoeL, LOOK.g.shoeR].forEach(l => {
    if (L.shoes === 'dress') {
      // low and sleek: a thin sole and a heel, the toe running out a little longer, the trouser leg over the top, and a
      // shine on the toe
      const up = lm(L.dressShoe), sole = lm(0x121212);
      box(l, 0.18, 0.07, 0.25, up, 0, -0.51, 0.03); box(l, 0.15, 0.05, 0.06, up, 0, -0.52, 0.175);
      box(l, 0.186, 0.018, 0.3, sole, 0, -0.547, 0.045); box(l, 0.17, 0.03, 0.07, sole, 0, -0.535, -0.065);
      box(l, 0.06, 0.008, 0.012, lm(shade(L.dressShoe, 0.6)), 0, -0.476, 0.09);
      box(l, 0.05, 0.006, 0.05, lm(L.dressShoe === 0x141416 ? 0x4a4a50 : shade(L.dressShoe, 1.7)), 0, -0.494, 0.17);
    } else if (L.shoes === 'sneakers') {
      const [up, sole, stripe] = L.sneak;
      box(l, 0.2, 0.085, 0.27, lm(up), 0, -0.5, 0.03); box(l, 0.205, 0.03, 0.28, lm(sole), 0, -0.54, 0.032);
      box(l, 0.204, 0.022, 0.12, lm(stripe), 0, -0.505, 0.02); box(l, 0.1, 0.012, 0.09, lm(0xe8e4dc), 0, -0.455, 0.1);
      box(l, 0.202, 0.05, 0.05, lm(sole), 0, -0.522, 0.152);
    } else {
      const [up, sole, lace] = SH[L.shoes];
      box(l, 0.2, 0.1, 0.27, lm(up), 0, -0.495, 0.03); box(l, 0.205, 0.035, 0.28, lm(sole), 0, -0.54, 0.032);
      box(l, 0.11, 0.012, 0.09, lm(lace), 0, -0.444, 0.1); box(l, 0.204, 0.025, 0.232, lm(up), 0, -0.445, 0.0);
    }
  });
  buildWrists(L);
  return sils;
}
// what's on the wrists (L.wrist, dealWrists): just back from the hand (WRIST_Z), on the bare wrist or over a long
// sleeve's cuff, its face or clasp on top
const WRIST_Z = 0.405;
let iceMat = null;
function buildWrists(L) {
  const w = L.wrist; if (!w) return;
  const long = !!L.under || ['hoodie', 'poloLong', 'suit'].includes(L.top), W0 = long ? 0.176 : 0.15, top = W0 / 2, z = WRIST_Z;
  for (const s of ['L', 'R']) {
    const it = w[s], a = LOOK.g['arm' + s], out = s === 'L' ? -1 : 1; if (!it) continue;
    const band = (wd, len, c, dz) => box(a, wd, wd, len, lm(c), 0, 0, z + (dz || 0));
    if (it.kind === 'watch') {
      const st = it.style, m = it.metal, dig = st === 'digital', cw = dig ? 0.052 : 0.046, dark = new THREE.Color(it.face).getHSL({}).l < 0.4;
      // the strap, or a bracelet of links (steel, gold, platinum) with its links picked out
      if (st === 'gold' || st === 'ice' || st === 'steel') { band(W0, 0.022, m); [-0.006, 0.006].forEach(dz => band(W0 + 0.002, 0.003, shade(m, 0.72), dz)); }
      else { band(W0, 0.018, it.strap); if (st === 'leather') band(W0 + 0.002, 0.004, shade(it.strap, 0.7), 0); }
      box(a, cw, 0.014, cw, lm(m), 0, top + 0.007, z);                                           // the case
      box(a, 0.008, 0.008, 0.007, lm(shade(m, 0.85)), out * (cw / 2 + 0.003), top + 0.007, z);   // the crown, on the outside
      box(a, cw - 0.012, 0.003, cw - 0.012, lm(it.face), 0, top + 0.0155, z);                     // the face
      if (dig) { box(a, 0.026, 0.0014, 0.012, lm(0x2a2e26), 0, top + 0.0172, z); [-1, 1].forEach(k => box(a, 0.006, 0.006, 0.006, lm(0x5a5a5e), k * 0.017, top + 0.016, z - cw / 2 - 0.001)); }   // the digits; the buttons
      else {
        const hc = lm(dark ? 0xeceae4 : 0x1a1a1c), mk = (len, turn) => { const o = len / 2 - 0.002; box(a, 0.003, 0.0014, len, hc, Math.sin(turn) * o, top + 0.0175, z + Math.cos(turn) * o).rotation.y = turn; };
        mk(0.011, it.turn); mk(0.016, it.turn2);   // the hands, at their own time
        [0, 1, 2, 3].forEach(k => { const an = k * Math.PI / 2; box(a, 0.004, 0.0012, 0.004, hc, Math.sin(an) * 0.014, top + 0.0172, z + Math.cos(an) * 0.014); });   // twelve, three, six, nine
      }
      if (st === 'ice') {
        // diamonds set all the way round the bezel, catching the light (lit by nothing, so they always shine)
        iceMat = iceMat || basic(0xf2faff);
        for (let k = 0; k < 16; k++) { const an = k * Math.PI / 8, rr2 = cw / 2 - 0.003, c = Math.max(Math.abs(Math.cos(an)), Math.abs(Math.sin(an))); box(a, 0.005, 0.004, 0.005, iceMat, Math.sin(an) / c * rr2, top + 0.0155, z + Math.cos(an) / c * rr2); }
        [-0.006, 0.006].forEach(dz => [-1, 1].forEach(k => box(a, 0.004, 0.003, 0.004, iceMat, k * 0.03, top + 0.0012, z + dz)));   // and down the bracelet
      }
    } else if (it.kind === 'chain') {
      band(W0, 0.009, it.metal); band(W0 + 0.003, 0.004, shade(it.metal, 0.7), 0.0025); band(W0 + 0.003, 0.004, shade(it.metal, 1.15), -0.0025);   // links, light and dark
      box(a, 0.012, 0.006, 0.01, lm(it.metal), 0, top + 0.003, z);                                // the clasp
    } else if (it.kind === 'beads') {
      // beads strung tight round the wrist, a few to a side (as many as it has colours for)
      const h = top + 0.006, per = it.cols.length / 4, sp = 2 * h / per, sz = sp * 0.9;
      it.cols.forEach((c, k) => { const side = Math.floor(k / per), t = -h + sp * (k % per + 0.5), x = side === 0 ? t : side === 2 ? -t : side === 1 ? h : -h, y = side === 0 ? h : side === 2 ? -h : side === 1 ? -t : t; box(a, sz, sz, sz, lm(c), x, y, z); });
    } else if (it.kind === 'band') {
      band(W0, 0.014, it.col); if (it.col2) band(W0 - 0.002, 0.012, it.col2, -0.018);   // a rubber band, and now and then another behind it
    } else if (it.kind === 'cuff') {
      band(W0 + 0.002, 0.042, it.col); band(W0 + 0.004, 0.004, shade(it.col, 0.7), 0.017); band(W0 + 0.004, 0.004, shade(it.col, 0.7), -0.017);   // a leather cuff, its edges stitched
      box(a, 0.012, 0.006, 0.012, lm(it.metal), 0, top + 0.004, z);                               // the snap
    } else if (it.kind === 'paracord') {
      band(W0, 0.022, it.col); const c2 = lm(it.col2 || shade(it.col, 0.62));
      for (let k = 0; k < 5; k++) { const b = box(a, 0.007, 0.004, 0.02, c2, -0.024 + k * 0.012, top + 0.001, z); b.rotation.y = 0.5; }   // the weave
      box(a, 0.024, 0.008, 0.018, lm(0x1c1c1e), out * (top + 0.002), 0, z);                        // the buckle, on the outside
    } else {
      // braided strings, three together
      it.cols.forEach((c, k) => band(W0 + 0.001 * k, 0.004, c, (k - 1) * 0.005));
    }
  }
}
rollLook();
