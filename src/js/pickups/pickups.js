// Drops: their models, outlines and collection.

import { scene, V3 } from '../core/renderer.js';
import { clamp, HALF, rand, rr } from '../core/math.js';
import { outline } from '../effects/screen-outlines.js';
import { NET } from '../net/net.js';
import { BLOB_TEX } from '../core/geometry.js';
import { P } from '../player/player.js';
import { WEAP } from '../weapons/gun-stats.js';
import { AMMO_NAME, AMMO_PICKUP_MUL, ammoAmt } from '../weapons/ammo.js';
import { modLv } from '../weapons/mod-levels.js';
import { magSize, recomputeEff, run, S, W, W8 } from '../game/run-state.js';
import { gunMeshes } from '../weapons/gun-materials.js';
import { buildGuns } from '../weapons/build-weapons.js';
import { glowTex } from '../effects/textures.js';
import { dropModel } from './drop-models.js';
import { xray } from '../effects/outlines.js';
import { addPlanks, METAL, plankRoom } from '../barricades/planks.js';
import { SFX } from '../audio/sfx.js';
import { glowGun, phase, state } from '../game/state.js';
import { equip } from '../weapons/reload.js';
import { bandMax } from '../player/bandages.js';
import { ammoTypes } from '../upgrades/upgrades.js';
import { feed, floatText, popEl } from '../ui/hud-text.js';
import { visAt } from '../lighting/vision.js';
import { deliverWeapon, flareDone, SLOT_WORD, supplyOpen } from '../stations/supply-drop.js';
import { gotGear, gunCall } from '../ui/gear-popup.js';
import { camFocus, spectating } from '../net/spectate.js';
import { gunGone, gunTakeLo, shareFx, updateShareTags } from '../net/teamwork.js';

export const pickups = [];
// how long a drop lies on the ground before it's gone (the last 10 seconds of that pulsing a warning); supply crates longer
const DROP_LIFE = 40, CRATE_LIFE = 90;
// how close you have to come to a drop to pick it up (m), times S.pickMul (the Long reach line: upgrades/tier-table.js)
const PICK_R = 0.9;
// pickups: each sits in a pulsing ground ring with a coloured outline so it reads in the dark
// (the supply crate off the radio, in teal so it stands apart). An ammo box holds one kind of round, the kind it shows. A weapon lying on the ground, or in
// its case off the radio, glows in its rarity's colour, the same as its card: grey common, green uncommon, blue rare,
// purple epic, orange legendary (a weapon with none, the starting pistol and bat, is uncommon: grey is only for aid).
// Every ammo box, whatever it holds, is the same bright brass yellow, a colour no other drop uses, so ammo reads as ammo
// at a glance (the box itself shows which kind: blue 9mm card, red magnum card, green shell box, olive rifle can)
const AMMO_COL = 0xffd23a;
const PICK_COL = { planks: 0xe0a86a, metal: 0xa9c2d6, med: 0xef6a52, supply: 0x4fd0c2, ammo: AMMO_COL };
const RAR_COL = { c: 0xc4bcad, u: 0x6fd07a, r: 0x5f9ee8, e: 0x9f7af2, l: 0xf0a050 };
export const weaponCol = id => RAR_COL[(WEAP[id] && WEAP[id].rar) || 'u'];
// (a planks drop is metal once there's a metalwork bench, barricades/metal-bars.js: cargo.metal, steel-blue)
const pickCol = (kind, ammoType, cargo) => kind === 'gun' ? weaponCol(cargo && cargo.id) : kind === 'supply' && cargo && cargo.kind === 'weapon' ? weaponCol(cargo.id) : kind === 'planks' && cargo && cargo.metal ? PICK_COL.metal : PICK_COL[kind];
const ringGeo = new THREE.RingGeometry(0.34, 0.44, 28), discGeo = new THREE.CircleGeometry(0.44, 28);
// a tall, soft shaft of light in the crate's colour standing up out of a supply crate, fading toward the top, so it stands out across
// the yard and through the dark
const BEAM_TEX = glowTex(4, 64, x => { const g = x.createLinearGradient(0, 64, 0, 0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 4, 64); });
const BEAM_GEO = new THREE.CylinderGeometry(0.1, 0.26, 7, 14, 1, true).translate(0, 3.5, 0);
function dropBeam(col) {
  const m = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ map: BEAM_TEX, color: col || 0xffa050, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.renderOrder = 3; m.userData.isOutline = true; return m;   // (kept out of the crate's outline)
}
let dropUid = 0;   // (each drop its own number, so a teammate watching you can follow it: net/spectate.js)
export function dropPickup(x, z, kind, amount, ammoType, cargo) {
  if (kind === 'planks' && METAL.on && !cargo) cargo = { metal: true };   // (metal, not wood, once there's a metalwork bench)
  const root = new THREE.Group(); root.position.set(x, 0, z); scene.add(root);
  const g = new THREE.Group(); root.add(g);
  dropModel(g, kind, ammoType, cargo);   // (pickups/drop-models.js)
  const col = pickCol(kind, ammoType, cargo);
  // planks and bandages can be left lying when you're full: they get their own copies of their materials so they can
  // go half grey on their own (greyDrop, below)
  const mats = [];
  if (kind === 'planks' || kind === 'med') g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData.c0 = o.material.color.clone(); mats.push(o.material); } });
  const fineOut = o => !o.userData.fine;   // (the merged detail has no outline of its own)
  const om = outline(g, col, 0, 0, null, fineOut);
  const xr = xray(g, col, true, false, fineOut);
  const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const discMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(ringGeo, ringMat), disc = new THREE.Mesh(discGeo, discMat);
  ring.rotation.x = disc.rotation.x = -Math.PI / 2; ring.position.y = 0.035; disc.position.y = 0.033; ring.renderOrder = disc.renderOrder = 2;
  if (kind === 'supply') { ring.scale.setScalar(1.8); disc.scale.setScalar(1.8); root.add(dropBeam(col)); }
  if (kind === 'gun') { ring.scale.setScalar(1.4); disc.scale.setScalar(1.4); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: BLOB_TEX, color: col, transparent: true, opacity: 0.26, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(kind === 'supply' ? 1.6 : 1.0, kind === 'supply' ? 1.6 : 1.0, 1); glow.renderOrder = 4;
  root.add(disc, ring, glow);
  g.scale.setScalar(0.01);
  if (kind !== 'supply' && (amount || 1) > 1) root.scale.setScalar(1.25);   // a doubled drop (a brute's) is a size bigger
  const rec = { uid: ++dropUid, g: root, item: g, ring, ringMat, discMat, om, xr, glow, kind, ammoType, cargo, x, z, mats, col: new THREE.Color(col), grey: 0, greyShown: 0, t: kind === 'gun' ? Infinity : (kind === 'supply' ? CRATE_LIFE : DROP_LIFE) + (S.dropLife || 0), ph: rand() * 6, amount: amount || 1, age: 0, toss: rr(0, Math.PI * 2) };
  pickups.push(rec); return rec;
}
// a drop you can't take right now (planks with your stack full, bandages with your bag full) is half grey and darker,
// its ring and glow dimmed, so it's plain you can't grab it; it eases back into colour as soon as you have room
const _gc = new THREE.Color(), _gl = new THREE.Color();
const greyOf = (c, k, out) => { const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; return out.copy(c).lerp(_gl.setRGB(l, l, l), k).multiplyScalar(1 - k * 0.9); };
function greyDrop(p, dt) {
  const full = p.kind === 'planks' ? !plankRoom() : p.kind === 'med' ? (P.band || 0) >= bandMax() : false;
  p.grey += ((full ? 0.5 : 0) - p.grey) * Math.min(1, dt * 3);
  if (Math.abs(p.grey - p.greyShown) < 0.004) return;
  p.greyShown = p.grey;
  p.mats.forEach(m => greyOf(m.userData.c0, p.grey, m.color));
  greyOf(p.col, p.grey, _gc); p.ringMat.color.copy(_gc); p.discMat.color.copy(_gc); p.glow.material.color.copy(_gc); p.om.color.copy(_gc); p.xr.rim.color.copy(_gc);
}
// drops: bob, glow, and collecting them
export function updatePickups(dt) {
  for (let k = pickups.length - 1; k >= 0; k--) {
    const p = pickups[k]; p.t -= dt; p.ph += dt * 3; p.age += dt;
    // a gun you put down lies there for two rounds (GUN_KEEP): when the round after those starts it gives its 10-second
    // warning and is gone
    if (p.kind === 'gun' && p.t === Infinity && run.wave >= p.cargo.until) p.t = 10;
    if (p.mats.length) greyDrop(p, dt);
    // tossed out of the body, then a slow bob and spin over a pulsing ring
    const a = Math.min(1, p.age / 0.32), pop = 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2);
    p.item.scale.setScalar(Math.max(0.01, pop));
    const hop = p.age < 0.32 ? Math.sin(a * Math.PI) * 0.55 : 0;
    p.item.position.set(Math.cos(p.toss) * 0.25 * (1 - a), hop + 0.06 + Math.sin(p.ph) * 0.06, Math.sin(p.toss) * 0.25 * (1 - a));
    p.item.rotation.y += dt * 1.3;
    const pulse = 0.5 + 0.5 * Math.sin(p.ph * 1.4);
    p.ring.scale.setScalar((p.kind === 'supply' ? 1.8 : p.kind === 'gun' ? 1.4 : 1) * (0.92 + pulse * 0.16)); p.ringMat.opacity = 0.45 + pulse * 0.4;
    // the last 10 seconds: it pulses, slowly at first and faster and faster, then shrinks away in the last moment
    const warn = clamp(1 - p.t / 10, 0, 1);
    p.wph = (p.wph || 0) + dt * Math.PI * 2 * (0.9 + 9 * warn * warn);
    const beat = 0.5 + 0.5 * Math.cos(p.wph), lit = warn > 0 ? 1 - Math.min(1, warn * 2) * (1 - beat) : 1, gone = clamp(p.t / 0.35, 0, 1);
    p.item.scale.multiplyScalar((1 + 0.14 * warn * beat) * (0.2 + 0.8 * gone)); p.ring.scale.multiplyScalar((1 + 0.12 * warn * beat) * gone);
    p.om.opacity = 0.2 + 0.75 * lit; p.xr.rim.opacity = 0.15 + (0.4 + 0.35 * pulse) * lit; p.ringMat.opacity *= 0.35 + 0.65 * lit;
    if (p.grey > 0.004) { const dim = 1 - p.grey * 1.2; p.om.opacity *= dim; p.ringMat.opacity *= dim; p.discMat.opacity = 0.16 * dim; }   // full: its ring and outline dimmed too
    if (p.kind === 'gun') shareFx(p, dt);   // shared with your team: in the sharer's colour, labelled (net/teamwork.js)
    // drops stay on screen outside your view cone (behind you, round a corner), just dimmer
    // down in co-op and watching a teammate, your own drops are hidden and left as they are (you can't reach them) and
    // theirs show instead: ghosts of the ones on their farm, there to see and never to take (p.ghost: updateSpecDrops,
    // net/spectate.js)
    const away = spectating(), seen = visAt(p.x, p.z);
    if (p.ghost) { p.t = 99; p.g.visible = away && camFocus().id === p.ghost; p.glow.material.opacity = 0.32 * (0.75 + 0.25 * pulse); continue; }
    p.g.visible = !away;
    p.glow.material.opacity = (0.32 + 0.3 * (1 - seen)) * (0.75 + 0.25 * pulse) * (0.3 + 0.7 * lit) * gone * (1 - p.grey * 1.2); p.glow.position.y = 0.55 + Math.sin(p.ph) * 0.06;
    let d = Math.hypot(p.x - P.x, p.z - P.z);
    // a drop out past the edge of the farm, where you can't walk, flies in to you once it's landed, picking up speed;
    // one you can't take yet (a full bag or stack) stops where it is and waits there, greyed out, never trailing after
    // you, and sets off again the moment you've room for it
    if (p.homing === undefined) p.homing = Math.max(Math.abs(p.x), Math.abs(p.z)) > HALF - 0.5;
    if (p.homing && p.age > 0.5 && p.kind !== 'supply' && p.kind !== 'gun' && !away) {   // (in co-op, every drop is only ever on its own player's farm)
      const full = (p.kind === 'med' && (P.band || 0) >= bandMax()) || (p.kind === 'planks' && !plankRoom());
      if (full) p.fly = 0;
      else {
        p.fly = (p.fly || 0) + dt; const sp = Math.min(10, 2 + p.fly * 6);   // (from a standstill again after a wait)
        if (d > 0) { const st = Math.min(d, sp * dt); p.x += (P.x - p.x) / d * st; p.z += (P.z - p.z) / d * st; p.g.position.x = p.x; p.g.position.z = p.z; p.item.position.y += Math.min(0.5, d * 0.08); d = Math.hypot(p.x - P.x, p.z - P.z); }
        p.t = Math.max(p.t, 12);   // and it doesn't run out on its way
      }
    }
    // a full bandage bag leaves the bandage where it lies (it never heals you on the spot), and so does a full plank
    // stack: it just stays there, greyed out (greyDrop), with no message
    const full = (p.kind === 'med' && (P.band || 0) >= bandMax()) || (p.kind === 'planks' && !plankRoom());
    if (d < PICK_R * (S.pickMul || 1) && !full && !isTake(p) && !away) {   // (a weapon is taken with E: takeIt, below)
      let ft = '';
      if (p.kind === 'planks') { const n = addPlanks(1), mw = p.cargo && p.cargo.metal ? 'metal' : 'planks'; feed(mw, n, mw); popEl('planks'); ft = '+' + n + (mw === 'metal' ? ' metal' : ''); SFX.pick(); }   // always the one plank (or bar of metal)
      else if (p.kind === 'med') { const n = Math.min(p.amount, bandMax() - (P.band || 0)); P.band = (P.band || 0) + n; feed('med', n, n > 1 ? 'bandages' : 'bandage'); ft = '+' + n + (n > 1 ? ' bandages' : ' bandage'); popEl('bands'); SFX.pick(); }
      else if (p.kind === 'supply') { flareDone(); supplyOpen(); ft = 'Supplies'; SFX.crate(); }   // (what's in it: stations/supply-drop.js)
      else {
        // an ammo box holds the one kind it looks like (if you've let go of every gun that takes it since, whichever you
        // carry now; with none at all, a little scrap)
        const opts = ammoTypes(), a = opts.includes(p.ammoType) ? p.ammoType : opts[0];
        if (a) { const amt = Math.max(1, Math.round(ammoAmt(a) * AMMO_PICKUP_MUL * S.ammoMul * p.amount)); W8.reserve[a] += amt; feed('ammo', amt, AMMO_NAME[a]); ft = '+' + amt + ' ' + AMMO_NAME[a]; }
        else { S.scrap += 2; feed('scrap', 2, 'scrap'); ft = '+2 scrap'; }
        SFX.pick();
      }
      floatText(p.x, p.z, ft, '#' + pickCol(p.kind, p.ammoType, p.cargo).toString(16).padStart(6, '0'), p.kind === 'planks' && p.cargo && p.cargo.metal ? 'metal' : /scrap/.test(ft) ? 'scrap' : p.kind);
      scene.remove(p.g); pickups.splice(k, 1);
    } else if (p.t <= 0) { if (p.kind === 'supply') flareDone(); scene.remove(p.g); pickups.splice(k, 1); }
  }
  updateShareTags();
}

// weapons are taken on purpose, with E (or the touch button), never just by walking over them: a weapon's case, and a
// gun put down to share with your team (gunDrop), lying where it was dropped with its upgrades and the rounds that were
// in it. The one it replaces goes on your gun rack (stations/armory.js), to swap back to there
const TAKE_R = 1.4;
const isTake = p => p.kind === 'gun' || (p.kind === 'supply' && !!p.cargo && p.cargo.kind === 'weapon');
export const takeId = p => p.kind === 'gun' ? p.cargo.id : p.cargo.id;
export function nearestTake() {
  if (P.dead || P.vault || state !== 'play') return null;
  let best = null, bd = TAKE_R;
  for (const p of pickups) { if (!isTake(p) || p.age < 0.4) continue; const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < bd) { bd = d; best = p; } }
  return best;
}
// put a weapon down where you stand: a copy of it as you carry it, lying on its side, to pick back up
const GUN_KEEP = 2;   // rounds a gun you've put down stays on the ground
function gunDrop(id) {
  const s = WEAP[id].slot, src = gunMeshes[s]; if (!src) return;
  const a = rr(0, Math.PI * 2);
  // it lasts the round it's put down in (or the next, put down between rounds) and the one after (GUN_KEEP)
  const until = (phase === 'wave' ? run.wave : run.wave + 1) + GUN_KEEP;
  // (yours, so you can share it with your team: gunShare, net/teamwork.js; gid names it to them, lo is what's on it)
  dropPickup(P.x + Math.sin(a) * 0.5, P.z + Math.cos(a) * 0.5, 'gun', 1, null, { id, model: layGun(src.clone(true)), mag: W8.mag[id] || 0, ak: W8.akMag[id] ? { ...W8.akMag[id] } : null, until,
    own: true, gid: (NET.id || 'me') + ':' + (++gunSeq), lo: gunLo(id), shared: false });
}
let gunSeq = 0;
// what's on one of your guns, as a teammate's game needs it to build it and to hand it over (as in myLoadout, net/arsenal.js)
function gunLo(id) { const mods = (W8.mods[id] || []).slice(), lv = {}; mods.forEach(m => { lv[m] = modLv(m); }); return { mods, lv, gt: { ...(W8.gt[id] || {}) }, pin: null, att: { ...(W8.att[id] || {}) }, rnd: W8.rounds && W8.rounds[id] ? JSON.parse(JSON.stringify(W8.rounds[id])) : null, ak: !!(W(id) || {}).akimbo }; }
// a gun model laid on its side on the ground, its holds put back square and its flash and outlines left off
export function layGun(copy) {
  copy.traverse(o => { for (let k = o.children.length - 1; k >= 0; k--) if (o.children[k].userData.isFlash || o.children[k].userData.isOutline) o.remove(o.children[k]); });
  copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); copy.scale.set(1, 1, 1); copy.visible = true;
  copy.children.forEach(h => { if (h.userData.side) { h.position.x = h.userData.x0 || 0; h.position.y = h.position.z = 0; h.rotation.set(0, 0, 0); h.visible = true; } });
  copy.updateMatrixWorld(true); const c = new THREE.Box3().setFromObject(copy).getCenter(new V3());
  const lay = new THREE.Group(); lay.rotation.set(0, rr(0, Math.PI * 2), Math.PI / 2); copy.position.set(-c.x, -c.y, -c.z); lay.position.y = 0.12; lay.add(copy);
  return lay;
}
export function takeIt(p) {
  const id = takeId(p), D = WEAP[id], old = W8.slot[D.slot];   // (what it replaces goes on your gun rack: stations/armory.js)
  if (!W8.owned.includes(id)) W8.owned.push(id);
  if (p.kind === 'gun' && p.cargo.gid) gunGone(p);   // (gone for the rest of the team too: net/teamwork.js)
  if (p.kind === 'gun') {
    // one a teammate shared: it comes to you with everything that was on it, yours to keep from now on
    if (!p.cargo.own && p.cargo.lo) gunTakeLo(id, p.cargo.lo);
    // your own gun back: as you left it, no fresh ammo with it
    W8.slot[D.slot] = id; recomputeEff(); delete W8.pin[id]; W8.mag[id] = Math.min(magSize(id), p.cargo.mag); if (p.cargo.ak) W8.akMag[id] = p.cargo.ak;
    equip(D.slot, true); buildGuns(); glowGun(id);
    gotGear({ ic: 'gear', kind: p.cargo.own === false ? 'From ' + (p.cargo.who || 'a teammate') : 'Picked back up', name: D.name, on: old ? 'In place of your ' + gunCall(old) : 'Your ' + SLOT_WORD[D.slot], text: '' });
  } else { deliverWeapon(id, p.cargo.from); if (p.cargo.from !== 'card') flareDone(); }
  floatText(p.x, p.z, D.name, '#f0c060', 'gear'); SFX.pick();
  scene.remove(p.g); const k = pickups.indexOf(p); if (k >= 0) pickups.splice(k, 1);
}
