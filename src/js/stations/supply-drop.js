// The radio's drop: the supply crate, called over the air (stations/recipes.js). A helicopter you hear
// coming brings each one in low over the yard, its shadow sweeping across the ground as it lets the crate go, and a red
// flare lit beside the crate where it lands burns, smoking, until a while after it's opened.

// what's on its way (supplyCargo: { kind: 'supply' } or { kind: 'weapon', id }) and where it'll come down (supplySpot,
// picked when it's called, with the way the helicopter comes in)
let supplyCargo = null, supplySpot = null;
const DROP_LEAD = 9, HELI_IN = 5.5, HELI_OUT = 4.5, HELI_SPEED = 14, HELI_PASS = 2.8;
const HELI_WASH = { t: 1.3, r: 3.6, push: 1, every: 0.05, n: 3 };
const HELI_PUSH = new THREE.Vector4(0, 0, 1, 0);   // the downwash's push on the grass (updatePushers, world/trees.js)
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
  const light = { x, y: 0.15, z, r: 6.5, int: 1.5, col: [1, 0.15, 0.09], t: 1, max: 1 }; flashes.push(light); lmT = 0;
  flare = { g, core, glow, halo, light, t: 0, end: 80, out: -1, smokeT: 0, sparkT: 0, jetT: 0, tip: new V3(), dir: new V3() };
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
const SLOT_WORD = { side: 'sidearm', long: 'long gun', auto: 'automatic', melee: 'melee weapon' };
function deliverWeapon(id, from) {
  const D = WEAP[id], old = W8.slot[D.slot];
  giveWeapon(id); buildGuns(); glowGun(id); SFX.upgrade && SFX.upgrade();
  gotGear({ ic: 'supply', kind: from === 'card' ? 'Your pick' : 'Off the radio', name: D.name, on: old ? 'In place of your ' + gunCall(old) : 'Your new ' + SLOT_WORD[D.slot], text: D.desc || '' });
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
        if (Math.hypot(hx - P.x, hz - P.z) < 9) shake = Math.max(shake, 0.035 * wk);
      }
    } else if (tr >= HELI_PASS && !supplyFall && supplyT <= 0) supplySpot = null;
  }
  if (supplyFall) {
    const f = supplyFall; f.m.position.y -= dt * 9; f.m.rotation.y += dt * 0.6;
    if (f.m.position.y <= 0) {
      scene.remove(f.m); supplyFall = null; dropPickup(f.x, f.z, 'supply', 1, undefined, f.cargo); groundDust(f.x, f.z, 1.3); dustBurst(f.x, 0.25, f.z, 10, 0, 0, 1.2); shake = Math.max(shake, 0.25); SFX.thud();
      lightFlare(f.x + rr(0.8, 1.1) * (rand() < 0.5 ? 1 : -1), f.z + rr(-0.6, 0.6));   // and a flare beside it
    }
  }
  stepFlare(dt);
}
// a new run: nothing on its way, no flare, no shadow
function resetDrops() { HELI_PUSH.w = 0; supplyT = 0; supplyCargo = null; supplySpot = null; heliShadow.visible = false; flareGone(); if (supplyFall) { scene.remove(supplyFall.m); supplyFall = null; } }
const dropBusy = () => supplyT > 0 || !!supplyFall;
const busyWhy = () => dropBusy() ? 'A drop is already on its way' : '';
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
