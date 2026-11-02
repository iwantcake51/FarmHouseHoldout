// The radio's drop: the supply crate, called over the air (stations/recipes.js). A helicopter you hear
// coming brings each one in low over the yard, its shadow sweeping across the ground as it lets the crate go, and a red
// flare lit beside the crate where it lands burns, smoking, until a while after it's opened.

import { GI, GI_VB } from '../ui/game-icons.js';
import { cam, scene, V3 } from '../core/renderer.js';
import { clamp, N, rand, rr, smooth } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { ci, cxw } from '../world/grid.js';
import { HOUSE } from '../world/house.js';
import { FX0, FX1, FZ0, FZ1 } from '../world/fence.js';
import { hardBlocked } from '../world/collision.js';
import { P } from '../player/player.js';
import { WEAP } from '../weapons/gun-stats.js';
import { AMMO_BATCH, AMMO_NAME } from '../weapons/ammo.js';
import { fitTier, hpCap, magChange, ownTier, recomputeEff, run, S, W8 } from '../game/run-state.js';
import { TIERS, tierName } from '../upgrades/tier-table.js';
import { loadRound, roundName, roundText, roundTypes } from '../weapons/rounds.js';
import { SLOTS } from '../weapons/slots.js';
import { buildGuns } from '../weapons/build-weapons.js';
import { partTex } from '../effects/textures.js';
import { smoke } from '../effects/smoke.js';
import { dustBurst, fx, groundDust, sparkBurst } from '../effects/puffs.js';
import { dmCase, dmSupply } from '../pickups/drop-models.js';
import { dropPickup, noGroundBlood, pickups } from '../pickups/pickups.js';
import { flashes } from '../weapons/explosives.js';
import { addPlanks } from '../barricades/planks.js';
import { matKind, matWord } from '../barricades/metal-bars.js';
import { setSupplyFall, setSupplyT, supplyFall, supplyT } from './station-ui.js';
import { AC, master, noiseBuf, nz } from '../audio/audio.js';
import { SFX } from '../audio/sfx.js';
import { glowGun, phase, setLmT, setShake, shake, state, worldT } from '../game/state.js';
import { bandMax } from '../player/bandages.js';
import { ammoTypes, giveWeapon, tierFits } from '../upgrades/upgrades.js';
import { runStat } from '../ui/run-stats.js';
import { feed, popEl } from '../ui/hud-text.js';
import { replay } from '../core/dom.js';
import { netSpawn, nr } from '../net/sync.js';
import { netClient } from '../net/net.js';
import { GROUND_PROPS, TREES } from '../world/trees.js';
import { curDark } from '../lighting/day-night.js';
import { gotGear, gunCall } from '../ui/gear-popup.js';

// what's on its way (supplyCargo: { kind: 'supply' } or { kind: 'weapon', id }) and where it'll come down (supplySpot,
// picked when it's called, with the way the helicopter comes in)
let supplyCargo = null, supplySpot = null;
const DROP_LEAD = 9, HELI_IN = 5.5, HELI_OUT = 4.5, HELI_SPEED = 14, HELI_PASS = 2.8;
const HELI_WASH = { t: 1.3, r: 3.6, push: 1, every: 0.05, n: 3 };
export const HELI_PUSH = new THREE.Vector4(0, 0, 1, 0);   // the downwash's push on the grass (updatePushers, world/trees.js)
export function callDrop(cargo, lead = DROP_LEAD) {
  runStat('drops');
  setSupplyT(lead); supplyCargo = cargo;
  let x, z;
  const out = cargo && cargo.stray && strayAt();   // (a stray crate: out past the fence, strayAt)
  if (out) { x = out.x; z = out.z; }
  else do { x = cxw((rr(FX0 + 2, FX1 - 2)) | 0); z = cxw((rr(FZ0 + 2, FZ1 - 2)) | 0); } while (hardBlocked(ci(x), ci(z)) || (x > HOUSE.x0 - 1 && x < HOUSE.x1 + 1 && z > HOUSE.z0 - 1 && z < HOUSE.z1 + 1));
  supplySpot = { x, z, a: rand() * Math.PI * 2, heard: false, t: -DROP_LEAD, dustT: 0 };
}
// a crate for what's in it: the square supply crate, or a long olive case with its latches and handle for a weapon
export function crateModel(g, cargo) { if (cargo && cargo.kind === 'weapon') dmCase(g, cargo); else dmSupply(g); }   // (pickups/drop-models.js)
// ---- the helicopter: a blade-slap chop over a turbine whine and a low engine rumble, coming in from one side, loudest
// as it passes over the drop and on away to the other, muffled while it's far; and its shadow on the ground
const HELI_CURVE = (() => { const c = new Float32Array(1024); for (let i = 0; i < c.length; i++) { const x = i / (c.length - 1) * 2 - 1; c[i] = Math.pow(Math.max(0, x), 6) * 1.6; } return c; })();
function heliSound(tIn, tOut) {
  if (!AC) return;
  const t0 = AC.currentTime, tP = t0 + tIn, tE = tP + tOut, out = AC.createGain(), lp = AC.createBiquadFilter();
  out.gain.setValueAtTime(0.0001, t0); out.gain.exponentialRampToValueAtTime(0.04, t0 + tIn * 0.5); out.gain.exponentialRampToValueAtTime(0.34, tP); out.gain.exponentialRampToValueAtTime(0.05, tP + tOut * 0.55); out.gain.exponentialRampToValueAtTime(0.0001, tE);
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, t0); lp.frequency.exponentialRampToValueAtTime(3000, tP); lp.frequency.exponentialRampToValueAtTime(520, tE);
  // the rotor: band-passed noise chopped into slaps at the blade rate, which drops a little as it goes by
  const rot = AC.createBufferSource(), bp = AC.createBiquadFilter(), chop = AC.createGain(), lfo = AC.createOscillator(), sh = AC.createWaveShaper();
  rot.buffer = noiseBuf; rot.loop = true; rot.playbackRate.setValueAtTime(1.08, t0); rot.playbackRate.setValueAtTime(1.08, tP - 0.5); rot.playbackRate.linearRampToValueAtTime(0.9, tP + 0.7);
  bp.type = 'bandpass'; bp.frequency.value = 210; bp.Q.value = 0.75; chop.gain.value = 0;
  lfo.type = 'sawtooth'; lfo.frequency.setValueAtTime(6.3, t0); lfo.frequency.setValueAtTime(6.3, tP - 0.5); lfo.frequency.linearRampToValueAtTime(5.7, tP + 0.7);
  sh.curve = HELI_CURVE; lfo.connect(sh); sh.connect(chop.gain); rot.connect(bp); bp.connect(chop); chop.connect(lp);
  // the engine under it, and the turbine's whine
  const rum = AC.createBufferSource(), rl = AC.createBiquadFilter(), rg = AC.createGain(); rum.buffer = noiseBuf; rum.loop = true; rl.type = 'lowpass'; rl.frequency.value = 120; rg.gain.value = 0.55; rum.connect(rl); rl.connect(rg); rg.connect(lp);
  const wh = AC.createOscillator(), wg = AC.createGain(); wh.type = 'triangle'; wh.frequency.setValueAtTime(1180, t0); wh.frequency.setValueAtTime(1180, tP - 0.4); wh.frequency.exponentialRampToValueAtTime(1010, tP + 0.6); wg.gain.value = 0.02; wh.connect(wg); wg.connect(lp);
  lp.connect(out);
  if (AC.createStereoPanner) { const pan = AC.createStereoPanner(); pan.pan.setValueAtTime(-0.85, t0); pan.pan.linearRampToValueAtTime(0, tP); pan.pan.linearRampToValueAtTime(0.85, tE); out.connect(pan); pan.connect(master); } else out.connect(master);
  [rot, lfo, rum, wh].forEach(n => { n.start(t0); n.stop(tE + 0.05); });
}
const heliShadow = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.filter = 'blur(3px)';
  const gr = x.createRadialGradient(92, 64, 0, 92, 64, 58); gr.addColorStop(0, 'rgba(0,0,0,.26)'); gr.addColorStop(0.8, 'rgba(0,0,0,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.beginPath(); x.arc(92, 64, 58, 0, Math.PI * 2); x.fill();                                  // the rotor's blur
  x.fillStyle = 'rgba(0,0,0,.5)'; x.beginPath(); x.ellipse(92, 64, 32, 14, 0, 0, Math.PI * 2); x.fill();          // the body
  x.fillRect(116, 60, 96, 8); x.fillRect(204, 50, 9, 28); x.beginPath(); x.arc(208, 64, 11, 0, Math.PI * 2); x.fill();   // the tail boom, its fin and rotor
  const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0x000000, transparent: true, depthWrite: false, opacity: 0 }));
  m.visible = false; m.renderOrder = 2; scene.add(m); return m;
})();
// ---- the helicopter itself, flying over the drop along its shadow's line at the height the crate falls from (HELI_FLY:
// how high, how long either side of the drop it's in the air for you to see, its rotors' spin): an olive transport, a
// long cabin with a glazed nose, the tail boom and fin with its tail rotor, skids under it, and a two-bladed rotor over
// it, turning so fast its blades are mostly a blurred disc. From your own eyes you see it come in over the trees and go
const HELI_FLY = { y: 18, t: 7, spin: 34, tailSpin: 90, bob: 0.25 };
const heli = (() => {
  const g = new THREE.Group(), body = lam(0x48502f), dark = lam(0x23261c), glass = lam(0x1a2a30, { emissive: 0x05090c }), B = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = false; g.add(o); return o; };
  B(1.9, 1.7, 4.6, body, 0, 0, 0.2); B(1.7, 1.3, 1.3, body, 0, -0.1, 3.0); B(1.5, 0.9, 0.9, glass, 0, 0.05, 3.55);   // the cabin, the nose and its glazing
  B(1.6, 0.6, 1.8, dark, 0, 1.1, 0.1);   // the engine housing on the roof
  B(0.45, 0.55, 5.4, body, 0, 0.35, -4.6); B(0.12, 1.4, 0.9, body, 0, 0.95, -7.1); B(1.3, 0.08, 0.5, body, 0, 0.3, -6.6);   // the tail boom, its fin and its stabiliser
  [-1, 1].forEach(sd => { B(0.08, 0.08, 4.2, dark, sd * 1.05, -1.3, 0.4); B(0.08, 0.5, 0.08, dark, sd * 1.0, -1.05, 1.5); B(0.08, 0.5, 0.08, dark, sd * 1.0, -1.05, -0.8); });   // the skids
  const rotor = new THREE.Group(); rotor.position.set(0, 1.55, 0.2); g.add(rotor);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(14, 0.05, 0.42), dark); rotor.add(blade); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10), dark); rotor.add(hub);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1c16, transparent: true, opacity: 0.22, depthWrite: false })); rotor.add(disc);
  const tail = new THREE.Group(); tail.position.set(0.12, 1.0, -7.1); g.add(tail);
  tail.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.18), dark)); const td = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateY(Math.PI / 2), disc.material); tail.add(td);
  g.visible = false; scene.add(g); g.userData.rotor = rotor; g.userData.tail = tail; return g;
})();
// ---- the flare: a red tube lying in the grass beside the crate, its tip fizzing white-hot, throwing a flickering red
// light round it and a column of red smoke, the odd spark; it burns on a while after the crate's opened, then dies
const FLARE_M = { tube: lam(0xb02a1e), band: lam(0xe8e2d4), cap: lam(0x262626) };
let flare = null;
const FLARE_FX = { smoke: 0.065, size: [0.55, 1.1], a: 0.55, lift: 9, jet: 0.045, drip: 0.12 }, _fq4 = new THREE.Quaternion();
function lightFlare(x, z) {
  if (flare) flareGone();
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rand() * Math.PI * 2; scene.add(g);
  const t = new THREE.Group(); t.rotation.z = 0.16; t.position.y = 0.035; g.add(t);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.3, 10), FLARE_M.tube); tube.rotation.z = Math.PI / 2; tube.castShadow = true; t.add(tube);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0255, 0.0255, 0.07, 10), FLARE_M.band); band.rotation.z = Math.PI / 2; band.position.x = -0.03; t.add(band);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 10), FLARE_M.cap); cap.rotation.z = Math.PI / 2; cap.position.x = -0.15; t.add(cap);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2ea })); core.position.x = 0.16; t.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: partTex('glow'), color: 0xff4a30, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), halo = glow.clone();
  halo.material = glow.material.clone(); halo.material.map = partTex('glowSoft'); glow.position.x = halo.position.x = 0.17; glow.scale.setScalar(0.7); halo.scale.setScalar(2.4); t.add(glow, halo);
  const light = { x, y: 0.15, z, r: 6.5, int: 1.5, col: [1, 0.15, 0.09], t: 1, max: 1 }; flashes.push(light); setLmT(0);
  flare = { g, core, glow, halo, light, t: 0, end: 80, out: -1, smokeT: 0, sparkT: 0, jetT: 0, tip: new V3(), dir: new V3() };
  nz(0.5, 'highpass', 2600, 1800, 0.14); nz(1.4, 'bandpass', 3000, 2400, 0.05, 0.6);   // struck, and the fizz catching
}
// the crate's been opened (or left to rot): the flare burns on a few seconds more, then gutters out
export function flareDone() { if (flare && flare.out < 0) flare.end = Math.min(flare.end, flare.t + 5); }
function flareGone() { if (!flare) return; scene.remove(flare.g); flare.light.t = 0; flare = null; setLmT(0); }
function stepFlare(dt) {
  const f = flare; if (!f) return;
  f.t += dt; if (f.out < 0 && f.t >= f.end) f.out = 0;
  if (f.out >= 0) f.out += dt;
  const k = f.out < 0 ? 1 : Math.max(0, 1 - f.out / 2.5), tt = worldT;
  if (k <= 0) { flareGone(); return; }
  const fl = (0.8 + 0.12 * Math.sin(tt * 31) + 0.08 * Math.sin(tt * 57.3 + 1.3)) * (rand() < 0.04 ? 0.75 : 1);   // a fizzing flicker
  f.light.t = f.light.max = 1; f.light.int = 1.5 * fl * k;
  f.glow.material.opacity = 0.95 * fl * k; f.halo.material.opacity = 0.35 * fl * k; f.glow.scale.setScalar(0.62 + 0.14 * fl); f.core.scale.setScalar(0.6 + 0.4 * k);
  f.core.getWorldPosition(f.tip); f.dir.set(1, 0, 0).applyQuaternion(f.core.parent.getWorldQuaternion(_fq4)).setY(0).normalize();   // the way its tip points
  // the burn (FLARE_FX: how often it puffs smoke, how big and thick, and how hard it climbs; how often it spits a tongue of flame off the
  // tip and a molten drip): a thick column of red smoke, lit by its own light, rolling up and carried off on the wind;
  // a fizzing white-hot tongue reddening as it leaves the tip, a sparkle at the tip and the odd drip and spark
  const F = FLARE_FX, T = f.tip, D = f.dir;
  if ((f.smokeT -= dt) <= 0 && k > 0.15) { f.smokeT = F.smoke; smoke(T.x + D.x * 0.04 + rr(-0.03, 0.03), T.y + 0.05, T.z + D.z * 0.04 + rr(-0.03, 0.03), D.x * rr(0.2, 0.5) + rr(-0.08, 0.08), rr(0.5, 0.85), D.z * rr(0.2, 0.5) + rr(-0.08, 0.08), rr(0.05, 0.08), rr(F.size[0], F.size[1]), rr(2.6, 3.8), F.a * k, 0xd86858, F.lift); }
  if ((f.jetT -= dt) <= 0 && f.out < 0) {
    f.jetT = F.jet;
    fx('flareJet', T.x, T.y + 0.01, T.z, D.x * rr(0.6, 1.3) + rr(-0.15, 0.15), rr(0.15, 0.45), D.z * rr(0.6, 1.3) + rr(-0.15, 0.15), rr(0.07, 0.1), rr(0.14, 0.24), rr(0.14, 0.24), 0.8);
    if (rand() < 0.35) fx('star', T.x, T.y + 0.02, T.z, 0, 0, 0, rr(0.12, 0.2), 0.05, 0.06, 0.8).s.material.color.setRGB(1.3, 0.6, 0.55);
    if (rand() < F.drip) fx('flareDrip', T.x, T.y, T.z, D.x * rr(0.4, 1.2) + rr(-0.4, 0.4), rr(0.4, 1.3), D.z * rr(0.4, 1.2) + rr(-0.4, 0.4), 0.035, 0.015, rr(0.25, 0.5), 1);
  }
  if ((f.sparkT -= dt) <= 0 && f.out < 0) { f.sparkT = rr(0.25, 0.6); sparkBurst(T.x, T.y + 0.02, T.z, 1 + (rand() * 2 | 0), D.x, D.z, 1.2); }
}
// a weapon out of its case (taken with E: takeIt in pickups/pickups.js; the one it replaces goes on your gun rack,
// stations/armory.js): it goes into your hands, and the card says what you got
export const SLOT_WORD = { side: 'sidearm', long: 'long gun', auto: 'automatic', melee: 'melee weapon' };
export function deliverWeapon(id, from) {
  const D = WEAP[id], old = W8.slot[D.slot];
  giveWeapon(id); buildGuns(); glowGun(id); SFX.upgrade && SFX.upgrade();
  gotGear({ ic: 'supply', kind: from === 'card' ? 'Your pick' : 'Off the radio', name: D.name, on: old ? 'In place of your ' + gunCall(old) : 'Your new ' + SLOT_WORD[D.slot], text: D.desc || '' });
}
// a stray crate (STRAY): now and then, from wave STRAY.from, one in STRAY.chance waves, somewhere between STRAY.at seconds
// into it, a chopper going over drops a crate in the yard for you, mid-wave, and you have to go out and get it with
// them coming in. Lighter than one off the radio (STRAY.ammo of its ammo, STRAY.band bandages, no health or planks) but
// with its military find. Rolled as each wave begins (waves/waves.js: waveBegins), each player their own: drops are
// each player's own in co-op
const STRAY = { from: 2, chance: 0.22, at: [25, 50], lead: 15, ammo: 1, band: 2, planks: 4, cache: [8, 2], extra: [4, 3], gap: [1.1, 2], yard: 8, tree: 2.4, prop: 1.3, ring: 1.1 };
export function strayRoll(n) { run.stray = n >= STRAY.from && rand() < STRAY.chance ? { t: rr(STRAY.at[0], STRAY.at[1]) } : null; }
// where a stray crate comes down: out in the yard past the fence (within STRAY.yard cells of it, short of the solid tree
// line at the edge), never in a tree's crown (STRAY.tree m off every trunk), on a bush or a rock (STRAY.prop), or on
// anything else stood there (nothing under it, its middle or a ring STRAY.ring round it, but the ground). Nearest the
// fence first, so it's a run out and back; null if there's nowhere
const _sr = new THREE.Raycaster(), _srO = new V3(), _srD = new V3(0, -1, 0);
function strayAt() {
  const still = scene.children.filter(o => o.userData.still), spots = [];
  for (let i = 2; i < N - 2; i++) for (let j = 2; j < N - 2; j++) {
    const d = Math.max(FX0 - 1 - i, i - FX1 - 1, FZ0 - 1 - j, j - FZ1 - 1); if (d < 1 || d > STRAY.yard) continue;
    if (hardBlocked(i, j)) continue; spots.push([i, j, d + rand() * 2]);
  }
  spots.sort((a, b) => a[2] - b[2]);
  for (const [i, j] of spots) {
    const x = cxw(i) + rr(-0.25, 0.25), z = cxw(j) + rr(-0.25, 0.25);
    if (TREES.some(t => Math.hypot(t.x - x, t.z - z) < STRAY.tree * Math.max(1, t.s))) continue;
    if (GROUND_PROPS.some(([px, pz, r]) => Math.hypot(px - x, pz - z) < STRAY.prop + r)) continue;
    let hit = false;
    for (let k = 0; k < 7 && !hit; k++) {
      const a = k / 6 * Math.PI * 2, rr0 = k ? STRAY.ring : 0; _srO.set(x + Math.cos(a) * rr0, 6, z + Math.sin(a) * rr0); _sr.set(_srO, _srD); _sr.far = 6;
      hit = _sr.intersectObjects(still, true).some(h => h.point.y > 0.08);
    }
    if (!hit) return { x, z };
  }
  return null;
}
// what comes in with it: while it's on its way, STRAY.extra more of them (one more every extra[1] waves), sprinters all,
// a second or so apart, coming in through the fence's gaps on the side it's coming down (zombies/spawn.js: spawnZombie's
// near), sent in by whoever runs the zombies (in co-op, the host's, net/sync.js: netSpawn). A crate off the radio, that
// you called yourself, brings none
let strayRush = null;
// how many of the rush are still to come: part of the wave's count, so the wave isn't over till they've come and gone
// (waves/waves.js; a joiner gets it with the host's queue, net/sync.js)
export const rushLeft = () => strayRush ? strayRush.n : 0;
export function updateSupplyDrop(dt) {
  if (run.stray && phase === 'wave' && !dropBusy() && (run.stray.t -= dt) <= 0) {
    run.stray = null; callDrop({ kind: 'supply', stray: true }, STRAY.lead);
    const n = STRAY.extra[0] + Math.floor(run.wave / STRAY.extra[1]), sp0 = supplySpot;
    if (!netClient()) { strayRush = { n, t: 0.6, near: [nr(sp0.x), nr(sp0.z)] }; run.waveTotal += n; }
    dropCallShow(sp0);   // (the sprinters aren't on it: they just come)
  }
  if (strayRush && phase === 'wave') {
    if ((strayRush.t -= dt) <= 0) { netSpawn('runner', undefined, strayRush.near); strayRush.t = rr(STRAY.gap[0], STRAY.gap[1]); if (--strayRush.n <= 0) strayRush = null; }
  } else strayRush = null;
  stepDropCall(dt);
  const sp = supplySpot;
  if (supplyT > 0 && sp) {
    setSupplyT(supplyT - dt); sp.t = -supplyT;
    if (!sp.heard && supplyT <= HELI_IN) { sp.heard = true; heliSound(Math.max(0.5, supplyT), HELI_OUT); }
    if (supplyT <= 0) {
      // let go right overhead: the crate falls turning slowly, the spot lit red as it comes down
      const m = new THREE.Group(); crateModel(m, supplyCargo); noGroundBlood(m); m.position.set(sp.x, 18, sp.z); scene.add(m);
      setSupplyFall({ m, x: sp.x, z: sp.z, cargo: supplyCargo }); flashes.push({ x: sp.x, z: sp.z, r: 5, int: 1.1, col: [1, 0.25, 0.2], t: 3, max: 3 }); setLmT(0);
      supplyCargo = null;
    }
  }
  if (sp) {
    // the helicopter's shadow sweeps over the spot as it drops the crate, and its downwash kicks up the dust there
    if (supplyT <= 0) sp.t += dt;
    const tr = sp.t, on = Math.abs(tr) < HELI_PASS;
    { const fly = Math.abs(tr) < HELI_FLY.t; heli.visible = fly;   // (the helicopter itself: HELI_FLY)
      if (fly) { const vx = -Math.cos(sp.a), vz = Math.sin(sp.a), d = tr * HELI_SPEED; heli.position.set(sp.x + vx * d, HELI_FLY.y + Math.sin(tr * 1.7) * HELI_FLY.bob, sp.z + vz * d); heli.rotation.set(0.08, Math.atan2(vx, vz), Math.sin(tr * 0.9) * 0.04); heli.userData.rotor.rotation.y += dt * HELI_FLY.spin; heli.userData.tail.rotation.x += dt * HELI_FLY.tailSpin; } }
    heliShadow.visible = on; if (!on) HELI_PUSH.w = 0;
    if (on) {
      const vx = -Math.cos(sp.a), vz = Math.sin(sp.a), d = tr * HELI_SPEED;
      heliShadow.position.set(sp.x + vx * d, 0.06, sp.z + vz * d); heliShadow.rotation.set(-Math.PI / 2, 0, sp.a);
      heliShadow.material.opacity = 0.8 * (1 - 0.75 * curDark) * smooth(clamp((HELI_PASS - Math.abs(tr)) / 0.8, 0, 1));
      // the downwash under it (HELI_WASH: how wide, how hard and how often it throws dust): the grass flattened out
      // round under it, dust and grit blasted out along the ground in a ring and swirling up, strongest right overhead
      const W = HELI_WASH, wk = smooth(clamp(1 - Math.abs(tr) / W.t, 0, 1)), hx = heliShadow.position.x, hz = heliShadow.position.z;
      HELI_PUSH.set(hx, hz, W.r, W.push * wk);
      if (wk > 0.05 && (sp.dustT -= dt) <= 0) {
        sp.dustT = W.every;
        for (let k = 0, n = Math.round(1 + W.n * wk); k < n; k++) {
          const a = rand() * 6.28, r = rr(0.4, W.r * 0.8), sx = Math.sin(a), sz = Math.cos(a), v = rr(2.2, 4.4) * wk;
          fx('dust', hx + sx * r, 0.08, hz + sz * r, sx * v, rr(0.05, 0.35), sz * v, rr(0.16, 0.26), rr(0.7, 1.25), rr(0.8, 1.3), rr(0.2, 0.32) * (0.5 + 0.5 * wk));
        }
        if (rand() < 0.5 * wk) { const a = rand() * 6.28, r = rr(0.5, 2); fx('debris', hx + Math.sin(a) * r, 0.1, hz + Math.cos(a) * r, Math.sin(a) * rr(1.5, 3), rr(1, 2.2), Math.cos(a) * rr(1.5, 3), 0.06, rr(0.12, 0.2), rr(0.6, 1), 0.8); }
        if (Math.hypot(hx - P.x, hz - P.z) < 9) setShake(Math.max(shake, 0.035 * wk));
      }
    } else if (tr >= HELI_FLY.t && !supplyFall && supplyT <= 0) supplySpot = null;
  }
  if (supplyFall) {
    const f = supplyFall; f.m.position.y -= dt * 9; f.m.rotation.y += dt * 0.6;
    if (f.m.position.y <= 0) {
      scene.remove(f.m); setSupplyFall(null); dropPickup(f.x, f.z, 'supply', 1, undefined, f.cargo); groundDust(f.x, f.z, 1.3); dustBurst(f.x, 0.25, f.z, 10, 0, 0, 1.2); setShake(Math.max(shake, 0.25)); SFX.thud();
      lightFlare(f.x + rr(0.8, 1.1) * (rand() < 0.5 ? 1 : -1), f.z + rr(-0.6, 0.6));   // and a flare beside it
    }
  }
  stepFlare(dt);
}
// The stray crate's card (dropCall): as it's called, a panel drops in under the top of the screen: a ring round the
// crate's icon running down the seconds till it lands, the time in big figures beside it, which side of the farm it's
// coming down on. After DROP_CALL.big seconds it folds down to a slim
// strip (the ring, the side, the seconds) that stays till it lands; then it reads "Crate down" for DROP_CALL.down
// seconds, or till it's opened. The farm's sides by the compass: north is -z, east is +x
const DROP_CALL = { big: 4.5, down: 5 }, COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const sideOf = (x, z) => COMPASS[(Math.round(Math.atan2(x - (cxw(FX0) + cxw(FX1)) / 2, (cxw(FZ0) + cxw(FZ1)) / 2 - z) / (Math.PI / 4)) + 8) % 8];
const dropCall = (() => {
  const el = document.createElement('div'); el.id = 'dropCall'; el.className = 'hud'; el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="dcSlab"><span class="dcRing"><svg class="dcArc" viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"></circle><circle cx="22" cy="22" r="19" pathLength="100"></circle></svg><svg class="dcIc" viewBox="${GI_VB}">${GI.supply}</svg></span>`
    + `<span class="dcTx"><small>Stray supply drop</small><b>Crate inbound</b><i class="dcSide"></i><em></em></span><span class="dcSec"><b></b><small>sec</small></span></div>`;
  document.body.appendChild(el); return el;
})();
let dCall = null;
function dropCallShow(sp) {
  const side = sideOf(sp.x, sp.z), el = dropCall;
  dCall = { t: 0, lead: supplyT, side, landed: -1, k: '' };
  el.querySelector('.dcTx b').textContent = 'Crate inbound';
  el.querySelector('em').textContent = `Coming down outside the fence to the ${side}`;
  el.querySelector('.dcSide').textContent = side.split('-').map(w => w[0]).join('').toUpperCase();   // (on the folded strip: N, NE...)
  el.className = 'hud'; replay(el, 'show');
}
function stepDropCall(dt) {
  const c = dCall, el = dropCall; if (!c) return;
  c.t += dt;
  const crate = pickups.find(p => p.kind === 'supply'), falling = supplyT > 0 || !!supplyFall;
  if (!falling && c.landed < 0) {
    if (!crate) { dropCallEnd(); return; }
    c.landed = c.t; el.querySelector('.dcTx b').textContent = 'Crate down'; el.querySelector('em').textContent = `Out past the fence to the ${c.side}`; el.classList.add('landed'); replay(el, 'land');
  }
  if (c.landed >= 0 && (!crate || c.t - c.landed > DROP_CALL.down)) { dropCallEnd(); return; }
  if (c.t > DROP_CALL.big && !el.classList.contains('mini')) el.classList.add('mini');
  const sec = Math.max(0, Math.ceil(supplyT)), k = sec + ':' + (c.landed >= 0);
  el.style.setProperty('--dc', (c.landed >= 0 ? 0 : clamp(supplyT / c.lead, 0, 1)).toFixed(3));
  if (c.k !== k) { c.k = k; el.querySelector('.dcSec b').textContent = c.landed >= 0 ? '0' : sec; if (sec <= 3 && c.landed < 0) replay(el.querySelector('.dcSec'), 'tick'); }
}
function dropCallEnd() { dCall = null; dropCall.classList.add('out'); setTimeout(() => { if (!dCall) dropCall.className = 'hud'; }, 400); }
// a new run: nothing on its way, no flare, no shadow
export function resetDrops() { strayRush = null; dCall = null; dropCall.className = 'hud'; heli.visible = false; HELI_PUSH.w = 0; setSupplyT(0); supplyCargo = null; supplySpot = null; heliShadow.visible = false; flareGone(); if (supplyFall) { scene.remove(supplyFall.m); setSupplyFall(null); } }
export const dropBusy = () => supplyT > 0 || !!supplyFall;
// The supply crate: what the radio sells, once every SUPPLY.every waves (from the wave it was last called on: run.dropAt),
// for its cost in scrap. What's in it grows with the wave, from a modest top-up on the first wave to a real resupply by
// wave SUPPLY.full, and so does its price: each is [on wave 1, by SUPPLY.full], in between along the way. Ammo for every
// calibre you carry (batches: the workbench's crafted batches, AMMO_BATCH), health (hp; full by the end), bandages, and
// planks (or metal, once there's a metalwork bench)
const SUPPLY = { every: 5, full: 15, cost: [20, 50], batches: [1.5, 5], hp: [30, 1], band: [1, 3], planks: [3, 8] };
export const dropWait = () => run.dropAt > 0 && run.wave < run.dropAt + SUPPLY.every;
const supplyAt = k => { const [a, b] = SUPPLY[k], f = clamp((Math.max(1, run.wave) - 1) / (SUPPLY.full - 1), 0, 1); return a + (b - a) * f; };
export const supplyCost = () => Math.round(supplyAt('cost') / 5) * 5;
const supplyAmmo = a => Math.round(AMMO_BATCH[a] * supplyAt('batches'));
// health back: a share of your full health that grows to all of it (SUPPLY.hp: [hp on wave 1, share by the end])
const supplyHp = () => { const f = clamp((Math.max(1, run.wave) - 1) / (SUPPLY.full - 1), 0, 1); return Math.round(SUPPLY.hp[0] + (S.maxHp * SUPPLY.hp[1] - SUPPLY.hp[0]) * f); };
// the crate opened (pickups/pickups.js): everything in it, each noted in the feed
export function supplyOpen(cargo) {
  if (cargo && cargo.stray) {   // (a stray crate, STRAY: a radio crate's ammo, bandages, planks, a cache of scrap and its find)
    ammoTypes().forEach(a => { const n = Math.max(1, Math.round(supplyAmmo(a) * STRAY.ammo)); W8.reserve[a] += n; feed('ammo', n, AMMO_NAME[a]); });
    const nb = Math.min(STRAY.band, Math.max(0, bandMax() - (P.band || 0))); if (nb) { P.band = (P.band || 0) + nb; feed('med', nb, nb > 1 ? 'bandages' : 'bandage'); popEl('bands'); }
    const np = addPlanks(STRAY.planks); if (np) { feed(matKind(), np, matWord()); popEl('planks'); }
    const sc = STRAY.cache[0] + STRAY.cache[1] * Math.max(1, run.wave); S.scrap += sc; popEl('scrap'); feed('scrap', sc, 'scrap');
    crateFind(); feed('supply', 0, 'Stray crate opened'); return;
  }
  ammoTypes().forEach(a => { const n = supplyAmmo(a); W8.reserve[a] += n; feed('ammo', n, AMMO_NAME[a]); });
  if (P.hp < hpCap() || P.bleed) { P.hp = Math.min(hpCap(), P.hp + supplyHp());   // (in full, even under Bad blood: upgrades/sacrifice.js)
    P.bleed = 0; feed('med', 0, 'Patched up'); }
  const nb = Math.min(Math.round(supplyAt('band')), Math.max(0, bandMax() - (P.band || 0))); if (nb) { P.band = (P.band || 0) + nb; feed('med', nb, nb > 1 ? 'bandages' : 'bandage'); popEl('bands'); }
  const np = addPlanks(Math.round(supplyAt('planks'))); if (np) { feed(matKind(), np, matWord()); popEl('planks'); }
  crateFind();
  feed('supply', 0, 'Supply crate opened');
}
// and what makes a crate more than the stations' stock in bulk: one military find (FIND), something no station sells
// you outright. Most often a field kit, the next step of an attachment for one of the guns you carry, fitted for
// nothing (a sight, a laser, a light, a can or a choke, a speed loader: whatever it can take next); or a box of special
// rounds for one of them, a kind you haven't got, loaded; failing either (nothing left to give), a cache of scrap
// (FIND.cache, more each wave). Shown as gear you've been given, as the bench's are (ui/gear-popup.js)
const FIND = { kit: 0.6, rounds: 0.32, cache: [14, 2] };   // (the rest of the time, a cache)
const FIND_LINES = ['sight', 'laser', 'light', 'supp', 'choke', 'loader'];
function crateFind() {
  const guns = SLOTS.map(s => W8.slot[s]).filter(id => id && WEAP[id] && !WEAP[id].melee);
  const kits = [], rnds = [];
  guns.forEach(id => {
    FIND_LINES.forEach(k => { if (tierFits(k, id) && !(k === 'choke' && WEAP[id].ammo !== 'shells')) kits.push([id, k]); });
    const r = W8.rounds[id]; roundTypes(id).forEach(k => { if (k !== 'std' && !(r && r.own.includes(k))) rnds.push([id, k]); });
  });
  const roll = rand(), pickOne = a => a[Math.floor(rand() * a.length)];
  if (kits.length && (roll < FIND.kit || !rnds.length)) {
    const [id, k] = pickOne(kits), n = ownTier(id, k), st = TIERS[k].t[n], nm = tierName(k, n, id), txt = typeof st.text === 'function' ? st.text(WEAP[id], id) : st.text;
    magChange(id, () => { fitTier(id, k, n + 1); recomputeEff(); }); buildGuns(id); glowGun(id);
    feed('gear', 0, nm); gotGear({ ic: 'supply', kind: 'Field kit, in the crate', name: nm, gun: id, text: txt });
  } else if (rnds.length && roll < FIND.kit + FIND.rounds + (kits.length ? 0 : FIND.kit)) {
    const [id, k] = pickOne(rnds), nm = roundName(id, k);
    loadRound(id, k, true); buildGuns(id); glowGun(id);
    feed('gear', 0, nm); gotGear({ ic: 'supply', kind: 'Rounds, in the crate', name: nm, gun: id, text: roundText(id, k) });
  } else {
    const n = FIND.cache[0] + FIND.cache[1] * Math.max(1, run.wave); S.scrap += n; popEl('scrap'); feed('scrap', n, 'scrap');
    gotGear({ ic: 'supply', kind: 'A cache, in the crate', name: n + ' scrap', text: 'Someone\'s stash, taped under the lid.' });
  }
}
// the radio's card's text: what's in the crate, and how long till the radio's free again (one pip a wave)
export function supplyDesc() {
  if (supplyT > 0) return `Inbound: lands in the yard in <b>${Math.ceil(supplyT)}s</b>`;
  if (supplyFall) return 'Coming down now';
  const hp = supplyHp(), nb = Math.round(supplyAt('band')), ammo = ammoTypes().map(a => `+${supplyAmmo(a)} ${AMMO_NAME[a]}`);
  const gets = ['<b>A military find: an attachment or rounds for a gun of yours</b>', ...(ammo.length ? ammo : ['Ammo for your guns']), hp >= hpCap() ? 'Health to full' : `+${hp} health`, `+${nb} bandage${nb > 1 ? 's' : ''}`, `+${Math.round(supplyAt('planks'))} ${matWord()}`];
  const left = dropWait() ? run.dropAt + SUPPLY.every - run.wave : 0;
  const pips = Array.from({ length: SUPPLY.every }, (_, k) => `<i${k < SUPPLY.every - left ? ' class="on"' : ''}></i>`).join('');
  return `<span class="dropGets">${gets.map(g => `<i>${g}</i>`).join('')}</span><span class="dropPips${left ? '' : ' ready'}">${pips}<small>${left ? `Radio free again in ${left} wave${left > 1 ? 's' : ''}` : `One drop every ${SUPPLY.every} waves`}</small></span>`;
}
export const busyWhy = () => dropBusy() ? 'A drop is already on its way' : dropWait() ? `Ready on wave ${run.dropAt + SUPPLY.every}` : '';
// the crate's marker, from the moment it's called down until it's opened: a crate icon and how far off it is, floating
// over where it'll land (or the crate itself), or pinned to the edge of the screen with an arrow pointing to it while
// it's off screen
const dropMark = (() => {
  const el = document.createElement('div'); el.className = 'dropMark hud'; el.hidden = true;
  el.innerHTML = `<i class="dmArrow"></i><span class="dmPin"><svg viewBox="${GI_VB}">${GI.supply}</svg><b></b></span>`;
  document.body.appendChild(el); return el;
})();
const _dm = new V3(), DM_EDGE = 74;
export function updateDropMarker() {
  const crate = pickups.find(p => p.kind === 'supply'), f = supplyFall, at = crate || f || (supplyT > 0 && supplySpot);
  if (!at || state !== 'play' || P.dead) { if (!dropMark.hidden) dropMark.hidden = true; return; }
  dropMark.hidden = false;
  _dm.set(at.x, 1.2, at.z).project(cam);
  const bh = _dm.z > 1;   // (behind you in first person it comes out mirrored: turned back round, and to the edge)
  let sx = ((bh ? -_dm.x : _dm.x) + 1) / 2 * innerWidth, sy = (1 - (bh ? -_dm.y : _dm.y)) / 2 * innerHeight, ang = 0;
  const off = bh || sx < DM_EDGE || sx > innerWidth - DM_EDGE || sy < DM_EDGE + 30 || sy > innerHeight - DM_EDGE;
  if (off) {
    // pinned where the line from the middle of the screen toward it meets an edge, a little in from it
    const cx = innerWidth / 2, cy = innerHeight / 2, dx = sx - cx, dy = sy - cy, k = Math.min((cx - DM_EDGE) / (Math.abs(dx) || 1e-6), (cy - DM_EDGE) / (Math.abs(dy) || 1e-6));
    sx = cx + dx * k; sy = cy + dy * k; ang = Math.atan2(dy, dx);
  }
  const d = Math.round(Math.hypot(at.x - P.x, at.z - P.z)), cd = !crate && !f && supplyT > 0 ? Math.ceil(supplyT) : 0, key = (off ? 1 : 0) + ':' + d + ':' + (crate ? 1 : 0) + ':' + cd;   // (while it's on its way, the seconds till it lands too)
  dropMark.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
  if (off) dropMark.style.setProperty('--a', ang.toFixed(3) + 'rad');
  if (dropMark._k !== key) { dropMark._k = key; dropMark.classList.toggle('off', off); dropMark.classList.toggle('falling', !crate); dropMark.querySelector('b').textContent = (cd ? cd + ' s · ' : '') + d + ' m'; }
}
