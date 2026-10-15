// Round types. A gun can own several kinds of round (bought at the workbench, stations/recipes.js), but only one is
// loaded at a time (W8.rounds[id].on); the rest wait in the pouch until you load them, free at the bench or with X in
// the field, which dumps what's in the gun and reloads with the next kind you own (swapRounds). Each kind has its own
// job and its own price, so none is simply better: hollow points hit harder but stop in the first zombie, dragon's
// breath sets zombies burning for less on impact. Shotguns take buckshot, slugs, flechettes or dragon's breath (the
// only fire there is: no gun fires incendiary bullets); the hand cannon alone takes explosive tips, and the revolver
// alone piercing rounds (no other bullet goes through more zombies than its gun already does). A round's effect (fx)
// is applied last in recomputeEff (game/run-state.js), over everything else on the gun
const ROUNDS = {
  std: { name: 'Standard rounds', as: { shells: 'Buckshot' }, r: 'c', cost: 0, text: D => D.ammo === 'shells' ? 'Plain buckshot.' : 'Plain full-metal-jacket rounds.' },
  slug: { name: 'Slugs', r: 'u', cost: 12, fits: D => D.ammo === 'shells', vis: 'Yellow slug shells',
    text: 'One heavy slug instead of shot: huge damage, slams zombies back and staggers them, goes through 3, and barely loses damage at range.',
    // a slug hits like a rifle, slams the zombie back and staggers it, keeps most of its punch through each body, and
    // holds its damage far further out than any other load (its own drop-off, D.fall: SLUG_FALL, weapons/gun-mods.js)
    fx: (D, id) => { const W0 = WEAP[id]; D.dmg = SLUG_DMG * D.dmg / W0.dmg; D.spread = SLUG_SPREAD * D.spread / W0.spread; D.pellets = 1; D.pierce = (D.pierce || 0) + 2; D.pierceKeep = 0.85; D.kick = 14; D.stagger = 0.6; D.fall = SLUG_FALL; } },
  flech: { name: 'Flechettes', r: 'r', cost: 14, fits: D => D.ammo === 'shells', vis: 'Steel-grey flechette shells',
    text: 'A tight cloud of thin darts: each hits lighter, but they go through 2 more zombies, barely push them back, and every dart makes them bleed more.',
    // the opposite of a slug: thin steel darts, each one weak, that zip through 2 more zombies with hardly any loss and
    // barely push them, leaving them bleeding. Every dart that lands opens the bleed further (D.bleed per hit,
    // zombies/damage.js), and darts punch small holes rather than tearing limbs off (D.dart)
    fx: D => { D.pellets += 3; D.dmg *= 0.6; D.spread *= 0.55; D.pierce = (D.pierce || 0) + 2; D.pierceKeep = 0.9; D.kick *= 0.25; D.dart = true; D.bleed = DART_BLEED; } },
  hollow: { name: 'Hollow points', as: { hunting: 'Expanding rounds' }, r: 'c', cost: 10, fits: D => D.ammo !== 'shells', vis: 'Copper hollow-point tips',
    text: D => D.sniper ? '+30% damage, and every limb they hit comes off. They stop in the first zombie.' : '+30% damage, and limbs come off twice as easily. They stop in the first zombie.',
    fx: D => { D.dmg *= 1.3; D.pierce = 0; D.severX = 2; if (D.sniper) D.alwaysSever = true; } },
  fire: { name: "Dragon's breath", r: 'r', cost: 14, fits: D => D.ammo === 'shells', vis: 'Orange dragon\'s breath shells',
    text: `Shells spit fire and set zombies alight for 3 s, but only up close: damage falls off fast, and past ${DRAGON_MAX} m the pellets burn out and do nothing.`,
    fx: D => { D.ignite = true; D.dragon = true; D.dmg *= 0.8; D.fall = DRAGON_FALL; D.maxRange = DRAGON_MAX; } },
  pierce: { name: 'Piercing rounds', r: 'u', cost: 12, fits: (D, id) => id === 'revolver', vis: 'Black-tipped rounds',
    text: 'Go through 1 more zombie, at full power through each. −10% damage.',
    fx: D => { D.dmg *= 0.9; D.pierce = (D.pierce || 0) + 1; D.pierceKeep = Math.max(D.pierceKeep ?? PIERCE_KEEP, 0.9); } },
  boom: { name: 'Explosive tips', r: 'l', cost: 18, fits: (D, id) => id === 'deagle', vis: 'A red band on the magazine',
    text: 'Every round explodes on hit, but stops in the first zombie.',
    fx: D => { D.explode = 1.7; D.pierce = 0; } }
};
// a slug's damage (on the pump; another shotgun's is scaled by its own pellet damage) and its spread (a choke tightens
// it more, game/run-state.js)
const SLUG_DMG = 140, SLUG_SPREAD = 0.012;
// the order they're offered in, and the price of buying one for a gun (loading one you own is free)
const ROUND_ORDER = ['std', 'slug', 'flech', 'fire', 'hollow', 'pierce', 'boom'];
const roundOn = id => (id && W8.rounds && W8.rounds[id] && W8.rounds[id].on) || 'std';
const roundOwned = (id, k) => k === 'std' || !!(W8.rounds[id] && W8.rounds[id].own.includes(k));
const roundFits = (id, k) => { const D = WEAP[id]; return !!D && !D.melee && !!D.ammo && (k === 'std' || ROUNDS[k].fits(D, id)); };
const roundTypes = id => ROUND_ORDER.filter(k => roundFits(id, k));
const roundName = (id, k) => { const R = ROUNDS[k], D = WEAP[id]; return (R.as && (R.as[id] || R.as[D.ammo])) || R.name; };
const roundText = (id, k) => typeof ROUNDS[k].text === 'function' ? ROUNDS[k].text(WEAP[id], id) : ROUNDS[k].text;
function ownRound(id, k) { const r = W8.rounds[id] = W8.rounds[id] || { own: [], on: 'std' }; if (k !== 'std' && !r.own.includes(k)) r.own.push(k); }
// what's in the gun goes back in the pouch (a pair's two mags too), so the next rounds loaded are the new kind
function dumpMag(id) {
  const D = WEAP[id]; if (!D || !D.ammo) return;
  delete W8.relSave[id];   // (a reload left part done starts over with the new kind)
  W8.reserve[D.ammo] += W8.mag[id] || 0; W8.mag[id] = 0;
  if (W8.akMag[id]) W8.akMag[id] = { L: 0, R: 0 };
}
// load kind k into gun id: at the bench the mag is filled straight away from what you carry; in the field (swapRounds)
// the gun is emptied and reloaded
function loadRound(id, k, fill) {
  ownRound(id, k); dumpMag(id);
  W8.rounds[id].on = k; recomputeEff();
  if (fill) { delete W8.pin[id]; const n = Math.min(magSize(id), W8.reserve[WEAP[id].ammo]); W8.mag[id] = n; W8.reserve[WEAP[id].ammo] -= n; }
  buildGuns();
}
// X: the next kind of round you own for the gun in your hands, loaded with a reload
function swapRounds() {
  const id = curId(), D = id && W(id); if (!D || D.melee || !D.ammo || W8.reloading || P.vault || P.bandT > 0 || swapSt) return;
  const own = roundTypes(id).filter(k => roundOwned(id, k)); if (own.length < 2) { if (roundTypes(id).length > 1) toast('Only one kind of round for this gun', { icon: 'ammo', sub: 'Buy more at the workbench' }); return; }
  const next = own[(own.indexOf(roundOn(id)) + 1) % own.length];
  exitScope(); loadRound(id, next, false); roundSwitched(id);
  startReload();
}
