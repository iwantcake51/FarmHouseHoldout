// The radio's drops: the supply crate, and weapons ordered over the air (stations/recipes.js). A helicopter you hear
// coming brings each one in low over the yard, its shadow sweeping across the ground as it lets the crate go, and a red
// flare lit beside the crate where it lands burns, smoking, until a while after it's opened.

// what's on its way (supplyCargo: { kind: 'supply' } or { kind: 'weapon', id }) and where it'll come down (supplySpot,
// picked when it's called, with the way the helicopter comes in)
let supplyCargo = null, supplySpot = null;
const DROP_LEAD = 9, HELI_IN = 5.5, HELI_OUT = 4.5, HELI_SPEED = 14, HELI_PASS = 2.8;
function callDrop(cargo) {
  supplyT = DROP_LEAD; supplyCargo = cargo;
  let x, z; do { x = cxw((rr(FX0 + 2, FX1 - 2)) | 0); z = cxw((rr(FZ0 + 2, FZ1 - 2)) | 0); } while (hardBlocked(ci(x), ci(z)) || (x > HOUSE.x0 - 1 && x < HOUSE.x1 + 1 && z > HOUSE.z0 - 1 && z < HOUSE.z1 + 1));
  supplySpot = { x, z, a: rand() * Math.PI * 2, heard: false, t: -DROP_LEAD, dustT: 0 };
}
// a crate for what's in it: the square supply crate, or a long olive case with its latches and handle for a weapon
function crateModel(g, cargo) { if (cargo && cargo.kind === 'weapon') dmCase(g, cargo); else dmSupply(g); }   // (pickups/drop-models.js)
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
// ---- the flare: a red tube lying in the grass beside the crate, its tip fizzing white-hot, throwing a flickering red
// light round it and a column of red smoke, the odd spark; it burns on a while after the crate's opened, then dies
const FLARE_M = { tube: lam(0xb02a1e), band: lam(0xe8e2d4), cap: lam(0x262626) };
let flare = null;
function lightFlare(x, z) {
  if (flare) flareGone();
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rand() * Math.PI * 2; scene.add(g);
  const t = new THREE.Group(); t.rotation.z = 0.16; t.position.y = 0.035; g.add(t);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.3, 10), FLARE_M.tube); tube.rotation.z = Math.PI / 2; tube.castShadow = true; t.add(tube);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0255, 0.0255, 0.07, 10), FLARE_M.band); band.rotation.z = Math.PI / 2; band.position.x = -0.03; t.add(band);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 10), FLARE_M.cap); cap.rotation.z = Math.PI / 2; cap.position.x = -0.15; t.add(cap);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2ea })); core.position.x = 0.16; t.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: BLOB_TEX, color: 0xff4a30, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), halo = glow.clone();
  halo.material = glow.material.clone(); glow.position.x = halo.position.x = 0.17; glow.scale.setScalar(0.7); halo.scale.setScalar(2.4); t.add(glow, halo);
  const light = { x, z, r: 6.5, int: 1.5, col: [1, 0.15, 0.09], t: 1, max: 1 }; flashes.push(light); lmT = 0;
  flare = { g, core, glow, halo, light, t: 0, end: 80, out: -1, smokeT: 0, sparkT: 0, tip: new V3() };
  nz(0.5, 'highpass', 2600, 1800, 0.14); nz(1.4, 'bandpass', 3000, 2400, 0.05, 0.6);   // struck, and the fizz catching
}
// the crate's been opened (or left to rot): the flare burns on a few seconds more, then gutters out
function flareDone() { if (flare && flare.out < 0) flare.end = Math.min(flare.end, flare.t + 5); }
function flareGone() { if (!flare) return; scene.remove(flare.g); flare.light.t = 0; flare = null; lmT = 0; }
function stepFlare(dt) {
  const f = flare; if (!f) return;
  f.t += dt; if (f.out < 0 && f.t >= f.end) f.out = 0;
  if (f.out >= 0) f.out += dt;
  const k = f.out < 0 ? 1 : Math.max(0, 1 - f.out / 2.5), tt = worldT;
  if (k <= 0) { flareGone(); return; }
  const fl = (0.8 + 0.12 * Math.sin(tt * 31) + 0.08 * Math.sin(tt * 57.3 + 1.3)) * (rand() < 0.04 ? 0.75 : 1);   // a fizzing flicker
  f.light.t = f.light.max = 1; f.light.int = 1.5 * fl * k;
  f.glow.material.opacity = 0.95 * fl * k; f.halo.material.opacity = 0.35 * fl * k; f.glow.scale.setScalar(0.62 + 0.14 * fl); f.core.scale.setScalar(0.6 + 0.4 * k);
  f.core.getWorldPosition(f.tip);
  if ((f.smokeT -= dt) <= 0 && k > 0.15) { f.smokeT = 0.09; smoke(f.tip.x + rr(-0.03, 0.03), f.tip.y + 0.05, f.tip.z + rr(-0.03, 0.03), rr(-0.07, 0.07) + 0.12, rr(0.45, 0.75), rr(-0.07, 0.07), 0.05, rr(0.45, 0.8), rr(2.4, 3.4), 0.32 * k, 0xc8463a); }
  if ((f.sparkT -= dt) <= 0 && f.out < 0) { f.sparkT = rr(0.18, 0.45); sparkBurst(f.tip.x, f.tip.y + 0.02, f.tip.z, 1 + (rand() * 2 | 0), 0, 0, 0.9); }
}
// a weapon off the radio, out of its crate (taken with E: takeIt in pickups/pickups.js, which puts down the one it
// replaces): it goes into your hands, and the card says what you got
function deliverWeapon(id) {
  const D = WEAP[id], old = W8.slot[D.slot];
  giveWeapon(id); buildGuns(); gunGlow = 1; SFX.upgrade && SFX.upgrade();
  gotGear({ ic: 'supply', kind: 'Off the radio', name: D.name, on: old ? 'In place of your ' + gunCall(old) : 'Your new ' + SLOT_WORD[D.slot], text: D.desc || '' });
}
function updateSupplyDrop(dt) {
  const sp = supplySpot;
  if (supplyT > 0 && sp) {
    supplyT -= dt; sp.t = -supplyT;
    if (!sp.heard && supplyT <= HELI_IN) { sp.heard = true; heliSound(Math.max(0.5, supplyT), HELI_OUT); }
    if (supplyT <= 0) {
      // let go right overhead: the crate falls turning slowly, the spot lit red as it comes down
      const m = new THREE.Group(); crateModel(m, supplyCargo); m.position.set(sp.x, 18, sp.z); scene.add(m);
      supplyFall = { m, x: sp.x, z: sp.z, cargo: supplyCargo }; flashes.push({ x: sp.x, z: sp.z, r: 5, int: 1.1, col: [1, 0.25, 0.2], t: 3, max: 3 }); lmT = 0;
      supplyCargo = null;
    }
  }
  if (sp) {
    // the helicopter's shadow sweeps over the spot as it drops the crate, and its downwash kicks up the dust there
    if (supplyT <= 0) sp.t += dt;
    const tr = sp.t, on = Math.abs(tr) < HELI_PASS;
    heliShadow.visible = on;
    if (on) {
      const vx = -Math.cos(sp.a), vz = Math.sin(sp.a), d = tr * HELI_SPEED;
      heliShadow.position.set(sp.x + vx * d, 0.06, sp.z + vz * d); heliShadow.rotation.set(-Math.PI / 2, 0, sp.a);
      heliShadow.material.opacity = 0.8 * (1 - 0.75 * curDark) * smooth(clamp((HELI_PASS - Math.abs(tr)) / 0.8, 0, 1));
      if (Math.abs(tr) < 0.7 && (sp.dustT -= dt) <= 0) { sp.dustT = 0.12; groundDust(sp.x + rr(-1.5, 1.5), sp.z + rr(-1.5, 1.5), 0.6, rr(-1, 1), rr(-1, 1)); shake = Math.max(shake, 0.03); }
    } else if (tr >= HELI_PASS && !supplyFall && supplyT <= 0) supplySpot = null;
  }
  if (supplyFall) {
    const f = supplyFall; f.m.position.y -= dt * 9; f.m.rotation.y += dt * 0.6;
    if (f.m.position.y <= 0) {
      scene.remove(f.m); supplyFall = null; dropPickup(f.x, f.z, 'supply', 1, undefined, f.cargo); burst(f.x, 0.2, f.z, 12, 'dust'); shake = Math.max(shake, 0.25); SFX.thud();
      lightFlare(f.x + rr(0.8, 1.1) * (rand() < 0.5 ? 1 : -1), f.z + rr(-0.6, 0.6));   // and a flare beside it
    }
  }
  stepFlare(dt);
}
// a new run: nothing on its way, no flare, no shadow
function resetDrops() { supplyT = 0; supplyCargo = null; supplySpot = null; heliShadow.visible = false; flareGone(); if (supplyFall) { scene.remove(supplyFall.m); supplyFall = null; } }
// ---- weapons by radio: a gamble or a sure thing. A care package brings a gun of the kind you ask for, a sidearm
// (secondary) or a long gun or automatic (primary), whichever of that kind has turned up so far (it may not beat
// yours); an upgrade crate a gun guaranteed to beat the one you carry in its slot, priced by how good it is; a
// top-shelf crate the best gun out there yet, dearer still. Melee the same, any or better. A weapon only comes once its
// band is open (WEAP_OPEN, a wave ahead of the cards), never one you have, nor one already on its way or lying in its
// crate (and those don't turn up as cards after a wave either)
const RADIO_GUNS = Object.keys(GUN_WEAPONS).filter(id => GUN_WEAPONS[id].rar), RADIO_MELEE = Object.keys(MELEE_WEAPONS).filter(id => MELEE_WEAPONS[id].rar);
// what the radio charges: a care package (a random weapon), and the crates priced by the band of what's in them, the
// heavy guns (band 3: the assault rifle, the hunting rifle) and the top of the pile (band 4: the LMG, the drum
// shotgun) a good deal dearer than the rest
const RADIO_COST = { side: 12, primary: 18, melee: 8, up: [0, 22, 38, 78, 120], top: [0, 30, 55, 112, 165], meleeUp: [0, 14, 24, 36] };
// how likely a care package is to bring a gun of each band: the heavy ones rarely, for the price
const CARE_W = [0, 3, 2, 0.7, 0.3];
const BAND_WORD = ['', 'light', 'solid', 'heavy', 'top-tier'], SLOT_WORD = { side: 'sidearm', long: 'long gun', auto: 'automatic', melee: 'melee weapon' };
const radioOpen = id => run.wave + 1 >= WEAP_OPEN[weapPow(id)];
// the two care packages: what each brings, and how its card reads
const CARE = {
  side: { slots: ['side'], title: 'Sidearm care package', for: 'A secondary', desc: 'A random sidearm from whatever\'s turned up so far. It might not beat yours.' },
  primary: { slots: ['long', 'auto'], title: 'Primary care package', for: 'A primary', desc: 'A random long gun or automatic from whatever\'s turned up so far. It might not beat what you carry.' }
};
const radioPending = id => !!((supplyCargo && supplyCargo.id === id) || (supplyFall && supplyFall.cargo && supplyFall.cargo.id === id) || pickups.some(p => p.cargo && p.cargo.id === id));
const radioFree = id => radioOpen(id) && !held(id) && !radioPending(id);
const beats = id => weapPow(id) > weapPow(W8.slot[WEAP[id].slot]);
function radioPick(list, wt) { const tot = list.reduce((a, id) => a + wt(id), 0); let r = rand() * tot; for (const id of list) { r -= wt(id); if (r <= 0) return id; } return list[list.length - 1]; }
// the upgrade and top-shelf crates (and the better melee weapon) are settled once a wave, so their price holds; one
// that's been got another way since is settled again
let radioStock = { wave: -1 };
function radioOffer() {
  const st = radioStock, ok = id => id && radioFree(id) && beats(id);
  if (st.wave !== run.wave || (st.up && !ok(st.up)) || (st.top && !ok(st.top)) || (st.mel && !ok(st.mel))) {
    st.wave = run.wave;
    const ups = RADIO_GUNS.filter(id => radioFree(id) && beats(id));
    st.up = ups.length ? radioPick(ups, id => [0, 4, 1.6, 0.7, 0.3][weapPow(id) - weapPow(W8.slot[WEAP[id].slot])] || 0.2) : null;
    const free = RADIO_GUNS.filter(radioFree), topB = Math.max(0, ...free.map(weapPow)), tops = free.filter(id => weapPow(id) === topB && beats(id));
    st.top = tops.length && (!st.up || topB > weapPow(st.up)) ? radioPick(tops, () => 1) : null;
    const mels = RADIO_MELEE.filter(id => radioFree(id) && beats(id));
    st.mel = mels.length ? radioPick(mels, id => [0, 4, 1.5, 0.6][weapPow(id) - weapPow(W8.slot.melee)] || 0.3) : null;
  }
  return st;
}
const dropBusy = () => supplyT > 0 || !!supplyFall;
const busyWhy = () => dropBusy() ? 'A drop is already on its way' : '';
function radioCards() {
  const o = radioOffer(), out = [], group = 'Weapons by air';
  const sCur = id => W8.slot[WEAP[id].slot], than = id => sCur(id) ? `beats your ${gunCall(sCur(id))}` : `for your empty ${SLOT_NAME[WEAP[id].slot].toLowerCase()} slot`;
  const order = (id, label) => { callDrop({ kind: 'weapon', id }); feed('supply', 0, label + ' called'); toast(label + ' on its way', { kind: 'good', icon: 'supply', sub: 'Listen for the helicopter · it lands in the yard' }); };
  const guns = pk => RADIO_GUNS.filter(id => radioFree(id) && CARE[pk].slots.includes(WEAP[id].slot)), mels = () => RADIO_MELEE.filter(radioFree);
  for (const pk in CARE) { const c = CARE[pk];
    out.push({ ic: 'supply', group, for: () => c.for, cost: RADIO_COST[pk], title: () => c.title, desc: () => c.desc,
      why: () => busyWhy() || (guns(pk).length ? '' : 'Nothing on the wire yet'), make: () => order(radioPick(guns(pk), id => CARE_W[weapPow(id)]), c.title) }); }
  if (o.up) { const id = o.up, b = weapPow(id); out.push({ ic: 'supply', group, for: () => 'A better ' + SLOT_WORD[WEAP[id].slot], fx: () => [{ t: 'TIER ' + b + ' OF 4', good: true }, { t: 'GUARANTEED BETTER', good: true }], cost: RADIO_COST.up[b], title: () => 'Upgrade crate',
    desc: () => `A ${BAND_WORD[b]} ${SLOT_WORD[WEAP[id].slot]} that ${than(id)}. Which one is a surprise.`, why: busyWhy, make: () => order(id, 'Upgrade crate') }); }
  if (o.top) { const id = o.top, b = weapPow(id); out.push({ ic: 'supply', group, for: () => 'The best out there', fx: () => [{ t: 'TIER ' + b + ' OF 4', good: true }, { t: 'BEST YET', good: true }], cost: RADIO_COST.top[b], title: () => 'Top-shelf crate',
    desc: () => `The best ${SLOT_WORD[WEAP[id].slot]} anyone's found yet: ${BAND_WORD[b]}, and it ${than(id)}.`, why: busyWhy, make: () => order(id, 'Top-shelf crate') }); }
  out.push({ ic: 'supply', group, for: () => 'A melee weapon, any', cost: RADIO_COST.melee, title: () => 'Melee crate', desc: () => 'A random melee weapon from what\'s about. It might not beat yours.',
    why: () => busyWhy() || (mels().length ? '' : 'Nothing on the wire yet'), make: () => order(radioPick(mels(), id => [0, 3, 1.6, 0.8][weapPow(id)]), 'Melee crate') });
  if (o.mel) { const id = o.mel, b = weapPow(id); out.push({ ic: 'supply', group, for: () => 'A better melee weapon', fx: () => [{ t: 'GUARANTEED BETTER', good: true }], cost: RADIO_COST.meleeUp[b] || 36, title: () => 'Better blade crate',
    desc: () => `A ${BAND_WORD[b]} melee weapon that beats your ${gunCall(W8.slot.melee)}.`, why: busyWhy, make: () => order(id, 'Better blade crate') }); }
  return out;
}
// the crate's marker, from the moment it's called down until it's opened: a crate icon and how far off it is, floating
// over where it'll land (or the crate itself), or pinned to the edge of the screen with an arrow pointing to it while
// it's off screen
const dropMark = (() => {
  const el = document.createElement('div'); el.className = 'dropMark hud'; el.hidden = true;
  el.innerHTML = `<i class="dmArrow"></i><span class="dmPin"><svg viewBox="${GI_VB}">${GI.supply}</svg><b></b></span>`;
  document.body.appendChild(el); return el;
})();
const _dm = new V3(), DM_EDGE = 74;
function updateDropMarker() {
  const crate = pickups.find(p => p.kind === 'supply'), f = supplyFall, at = crate || f || (supplyT > 0 && supplySpot);
  if (!at || state !== 'play' || P.dead) { if (!dropMark.hidden) dropMark.hidden = true; return; }
  dropMark.hidden = false;
  _dm.set(at.x, 1.2, at.z).project(cam);
  let sx = (_dm.x + 1) / 2 * innerWidth, sy = (1 - _dm.y) / 2 * innerHeight, ang = 0;
  const off = sx < DM_EDGE || sx > innerWidth - DM_EDGE || sy < DM_EDGE + 30 || sy > innerHeight - DM_EDGE;
  if (off) {
    // pinned where the line from the middle of the screen toward it meets an edge, a little in from it
    const cx = innerWidth / 2, cy = innerHeight / 2, dx = sx - cx, dy = sy - cy, k = Math.min((cx - DM_EDGE) / (Math.abs(dx) || 1e-6), (cy - DM_EDGE) / (Math.abs(dy) || 1e-6));
    sx = cx + dx * k; sy = cy + dy * k; ang = Math.atan2(dy, dx);
  }
  const d = Math.round(Math.hypot(at.x - P.x, at.z - P.z)), key = (off ? 1 : 0) + ':' + d + ':' + (crate ? 1 : 0);
  dropMark.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
  if (off) dropMark.style.setProperty('--a', ang.toFixed(3) + 'rad');
  if (dropMark._k !== key) { dropMark._k = key; dropMark.classList.toggle('off', off); dropMark.classList.toggle('falling', !crate); dropMark.querySelector('b').textContent = d + ' m'; }
}
