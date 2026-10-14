// Spent casings and dropped magazines, plus pump/bolt cycling.

// ---- spent casings: semi-autos and automatics throw brass on every shot, the pump and the bolt throw it when cycled,
// the double barrel and the revolver only drop theirs when opened to reload ----
const EJECT = { pistol: 'fire', deagle: 'fire', smg: 'fire', sub: 'fire', ar: 'fire', lmg: 'fire', auto12: 'fire', pump: 'pump', hunting: 'bolt', dbl: 'breach', revolver: 'breach' };
const CASE_KIND = { p9: { r: 0.022, len: 0.05, body: 'brass' }, magnum: { r: 0.027, len: 0.065, body: 'brass' }, rifle: { r: 0.024, len: 0.1, body: 'brass' }, shells: { r: 0.037, len: 0.13, body: 'hull' } };
const CMAT = { brass: lam(0xc9a23f, { emissive: 0x2a1f06 }), hull: lam(0xa3261c, { emissive: 0x1c0503 }), head: lam(0xd8b25a, { emissive: 0x2a1f06 }) };
const CGEO = new THREE.CylinderGeometry(1, 1, 1, 7), UBOX_D = new THREE.BoxGeometry(1, 1, 1), DRUM_G = new THREE.CylinderGeometry(1, 1, 1, 14);
const casings = [];
for (let k = 0; k < 90; k++) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ'; g.visible = false; scene.add(g);
  const body = new THREE.Mesh(CGEO, CMAT.brass), head = new THREE.Mesh(CGEO, CMAT.head); g.add(body, head);
  casings.push({ g, body, head, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, roll: 0, r: 0.02, bounces: 0, kind: 'p9' });
}
let cIdx = 0, tinkT = 0;
const _cv = new V3(), _cR = new V3(), _cU = new V3(), _cF = new V3();
// mode: 'fire' flicks it out of the port to the shooter's right, 'pump'/'bolt' flings it the same way, higher,
// 'breach' pops shells up and back, 'dump' drops them at your feet. Everything starts at the real port on the posed gun
function ejectCasing(ammo, n, mode, sideSign) {
  const K = CASE_KIND[ammo] || CASE_KIND.p9, D = W(curId()), side = D && D.akimbo && (sideSign || W8.akSide) < 0 ? 'L' : 'R';
  const port = (MUZ[W8.cur] || 0.9) * (mode === 'breach' ? 0.18 : 0.38), right = mode === 'fire' || mode === 'pump' || mode === 'bolt';
  PM.g.updateMatrixWorld(true);
  const h = holdOf(W8.cur, side);
  // the gun's own axes in the world: the shooter's right is the gun's -x (the hand holding it is the rig's left)
  _cR.set(-1, 0, 0).transformDirection(h.matrixWorld); _cU.set(0, 1, 0).transformDirection(h.matrixWorld); _cF.set(0, 0, 1).transformDirection(h.matrixWorld);
  _cv.set(X + (right ? -0.04 : 0.04), GUN_Y + 0.05, port); h.localToWorld(_cv);
  if (right) smoke(_cv.x, _cv.y, _cv.z, _cR.x * 0.5, 0.3, _cR.z * 0.5, 0.04, 0.2, rr(0.6, 0.9), 0.22, 0xb8b0a4);   // a breath of smoke from the port
  for (let k = 0; k < n; k++) {
    const c = casings[cIdx = (cIdx + 1) % casings.length];
    c.kind = ammo; c.r = K.r; c.len = K.len; c.bounces = 0; c.life = rr(7, 10);
    c.body.material = CMAT[K.body]; c.body.scale.set(K.r, K.len, K.r); c.body.position.set(0, 0, 0);
    c.head.scale.set(K.r * 1.08, K.body === 'hull' ? K.len * 0.28 : 0.008, K.r * 1.08); c.head.position.set(0, -K.len / 2 + (K.body === 'hull' ? K.len * 0.14 : 0.004), 0);
    c.g.position.copy(_cv); c.g.visible = true; c.g.scale.setScalar(1);
    c.g.rotation.set(rr(0, 3), P.aim + rr(-0.5, 0.5), rr(0, 3));
    let side, up, back;
    if (mode === 'fire') { side = rr(1.8, 2.8); up = rr(1.6, 2.5); back = rr(0.2, 0.8); }
    else if (mode === 'pump' || mode === 'bolt') { side = rr(2.3, 3.3); up = rr(2.2, 3.2); back = rr(0.2, 0.8); }   // racked out hard
    else if (mode === 'breach') { side = rr(-0.4, 0.6); up = rr(2.4, 3.4); back = rr(1.2, 2.0); }
    else {   // dump: the whole cylinder's worth tumbles out together, each case falling its own way
      side = rr(-0.3, 1.1); up = rr(-0.2, 1.1); back = rr(-0.4, 0.8); c.g.position.y -= rr(0.04, 0.12);
      c.g.position.x += rr(-0.04, 0.04); c.g.position.z += rr(-0.04, 0.04); c.g.rotation.set(rr(-0.6, 0.6) + Math.PI / 2, P.aim + rr(-1, 1), rr(-0.5, 0.5));
    }
    // right is toward the shooter's right for every mode; the breach and dump modes keep their old feel through their own numbers
    const sx = right ? side : -side;
    c.vx = _cR.x * sx + _cU.x * up * 0.15 - _cF.x * back + P.vx * 0.8 + rr(-0.3, 0.3); c.vz = _cR.z * sx + _cU.z * up * 0.15 - _cF.z * back + P.vz * 0.8 + rr(-0.3, 0.3); c.vy = up;
    c.spin = rr(9, 17) * (rand() < 0.5 ? -1 : 1); c.roll = rr(-6, 6);
    c.age = 0; c.hot = right || mode === 'breach' ? 1 : 0.4;   // freshly fired brass: a glowing trail and a thread of smoke for a moment
  }
}
// a hot casing leaves a short glowing streak and a thread of smoke for its first moments in the air
// (made on first use: the glow texture is built in effects/textures.js, which loads after this file)
let caseGlows = null, cgIdx = 0;
function stepCaseTrails(dt) {
  if (!caseGlows) { caseGlows = []; const mat = new THREE.SpriteMaterial({ map: TEX_CORE, color: 0xffb860, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); for (let k = 0; k < 110; k++) { const s = new THREE.Sprite(mat.clone()); s.visible = false; scene.add(s); caseGlows.push({ s, t: 0, max: 0.2 }); } }
  for (const c of casings) {
    if (c.life <= 0 || c.age === undefined || c.age > 0.45 || c.kind === 'mag') continue;
    c.age += dt; if (c.bounces >= 1 || dt <= 0) continue;
    const g = caseGlows[cgIdx = (cgIdx + 1) % caseGlows.length], p = c.g.position, heat = c.hot * (1 - c.age / 0.45);
    g.s.position.copy(p); g.s.visible = true; g.t = g.max = 0.16 + 0.1 * heat; g.a = 0.55 * heat; g.sc = (c.kind === 'shells' ? 0.11 : 0.075) * (0.6 + heat * 0.6);
    if (c.wisp === undefined || c.age > c.wisp) { c.wisp = c.age + 0.07; smoke(p.x, p.y, p.z, c.vx * 0.05, 0.12, c.vz * 0.05, 0.02, 0.09, rr(0.45, 0.7), 0.16 * heat + 0.04, 0xc8c0b2); }
  }
  for (const g of caseGlows) {
    if (g.t <= 0) continue; g.t -= dt;
    if (g.t <= 0) { g.s.visible = false; continue; }
    const k = g.t / g.max; g.s.material.opacity = g.a * k; g.s.scale.setScalar(g.sc * (0.5 + 0.5 * k));
  }
}
// a belt-fed gun throws its spent links as well as its brass: each M13 link is a dark steel clip with two loops,
// flicked out of the right of the feed tray with every round, slower and higher than the cases
const LINK_MAT = lam(0x4e5054), LINK_LOOP = new THREE.TorusGeometry(0.0082, 0.0017, 4, 9, Math.PI * 1.4);
const links = [];
for (let k = 0; k < 60; k++) {
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  [-0.011, 0.011].forEach(o => { const t = new THREE.Mesh(LINK_LOOP, LINK_MAT); t.position.z = o; g.add(t); });
  const st = new THREE.Mesh(UBOX_D, LINK_MAT); st.scale.set(0.004, 0.0016, 0.03); st.position.set(0.0075, -0.002, 0); g.add(st);
  links.push({ g, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, roll: 0, r: 0.006, bounces: 4, kind: 'link' });
}
let lIdx = 0;
function ejectLinks(n, z) {
  PM.g.updateMatrixWorld(true);
  const h = holdOf(W8.cur, 'R');
  _cR.set(-1, 0, 0).transformDirection(h.matrixWorld); _cF.set(0, 0, 1).transformDirection(h.matrixWorld);
  _cv.set(X - 0.036, GUN_Y + 0.025, z); h.localToWorld(_cv);
  for (let k = 0; k < n; k++) {
    const c = links[lIdx = (lIdx + 1) % links.length], side = rr(1.1, 1.9), up = rr(1.4, 2.2), back = rr(-0.2, 0.3);
    c.g.position.copy(_cv); c.g.visible = true; c.g.scale.setScalar(1); c.g.rotation.set(rr(0, 3), P.aim + rr(-0.6, 0.6), rr(0, 3));
    c.vx = _cR.x * side - _cF.x * back + P.vx * 0.8 + rr(-0.25, 0.25); c.vz = _cR.z * side - _cF.z * back + P.vz * 0.8 + rr(-0.25, 0.25); c.vy = up;
    c.spin = rr(10, 18) * (rand() < 0.5 ? -1 : 1); c.roll = rr(-7, 7); c.bounces = 0; c.life = rr(7, 10);
  }
}
function stepCasings(dt) { stepDebris(casings, dt); stepDebris(mags, dt); stepDebris(links, dt); stepCaseTrails(dt); }
const mags = [];
for (let k = 0; k < 10; k++) { const g = new THREE.Group(); g.visible = false; scene.add(g); const body = new THREE.Mesh(UBOX_D, GM.metal2); body.castShadow = true; g.add(body); mags.push({ g, body, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, roll: 0, r: 0.03, bounces: 4, kind: 'mag' }); }
let mIdx = 0;
// the empty magazine falls out of the well when you start a reload, bounces and lies there a while
function dropMag(id, side) {
  const D = W(id), mp = MAGPOS[W8.cur]; if (!D || !mp) return;
  const gg = gunMeshes[W8.cur]; PM.g.updateMatrixWorld(true);
  // the mag that falls is the one on the model (weapons/gun-models.js): its size across, down and along the gun, or a
  // drum (its radius and thickness, and which way its axis runs: along the gun or across it)
  const mt = T('mag'), c = mags[mIdx = (mIdx + 1) % mags.length];
  let w = 0.05, h = 0.15, d = 0.07, mat = GM.metal2, dr = null;
  if (id === 'pistol') { if (mt >= 3) dr = { r: 0.08, t: 0.072, ax: 'z' }; else { w = 0.024; h = [0.15, 0.17, 0.33][mt]; d = 0.055; mat = GM.poly; } }
  else if (id === 'deagle') { w = 0.026; h = 0.17; d = 0.065; }
  else if (id === 'smg') { if (mt >= 3) dr = { r: 0.08, t: 0.056, ax: 'x' }; else { w = 0.028; h = 0.29 + 0.05 * mt; d = 0.06; mat = GM.poly; } }
  else if (id === 'sub') { w = 0.026; h = hasMod('stack') ? 0.36 : 0.24; d = 0.042; }
  else if (id === 'ar') { if (mt >= 2) dr = { r: mt >= 3 ? 0.15 : 0.115, t: mt >= 3 ? 0.12 : 0.1, ax: 'x' }; else { w = 0.046; h = mt === 1 ? 0.26 : 0.2; d = 0.104; } }
  else if (id === 'auto12') dr = { r: 0.114, t: 0.078, ax: 'z' };
  else if (id === 'lmg') { w = 0.1; h = 0.22 + 0.018 * mt; d = 0.174; mat = GM.olive; }
  c.body.geometry = dr ? DRUM_G : UBOX_D; c.body.material = mat;
  if (dr) { c.body.scale.set(dr.r, dr.t, dr.r); c.body.rotation.set(dr.ax === 'z' ? Math.PI / 2 : 0, 0, dr.ax === 'x' ? Math.PI / 2 : 0); c.r = dr.r * 0.6; c.rest = g => { g.rotation.set(0, g.rotation.y, 0); c.body.rotation.set(0, 0, 0); }; c.restY = dr.t / 2; }
  else { c.body.scale.set(w, h, d); c.body.rotation.set(0, 0, 0); c.r = w / 2; c.rest = g => { g.rotation.set(0, g.rotation.y, Math.PI / 2); }; c.restY = w / 2; }
  // an akimbo pair's left gun drops its own mag, from its own hand
  if (side === 'L' && HOLDS[W8.cur] && HOLDS[W8.cur].L) { const h = HOLDS[W8.cur]; _cv.set(mp[0] - h.R.position.x, mp[1], mp[2]); h.L.localToWorld(_cv); }
  else if (side === 'R' && HOLDS[W8.cur] && HOLDS[W8.cur].L) { const h = HOLDS[W8.cur]; _cv.set(mp[0] - h.R.position.x, mp[1], mp[2]); h.R.localToWorld(_cv); }
  else { _cv.set(mp[0], mp[1], mp[2]); gg.localToWorld(_cv); }
  c.g.position.copy(_cv); c.g.rotation.set(0.2, P.aim, 0); c.g.scale.setScalar(1); c.g.visible = true;
  const fx = Math.sin(P.aim), fz = Math.cos(P.aim);
  c.vx = P.vx * 0.6 + fx * rr(0.2, 0.6) + rr(-0.3, 0.3); c.vz = P.vz * 0.6 + fz * rr(0.2, 0.6) + rr(-0.3, 0.3); c.vy = rr(-0.2, 0.6);
  c.spin = rr(3, 7) * (rand() < 0.5 ? -1 : 1); c.roll = rr(-4, 4); c.bounces = 0; c.life = 14; c.kind = 'mag';
}
function stepDebris(list, dt) {
  tinkT -= dt;
  for (const c of list) {
    if (c.life <= 0) continue;
    c.life -= dt; const g = c.g;
    if (c.bounces < 4) {
      c.vy -= (c.kind === 'mag' ? 13 : 10) * dt; if (c.bounces === 0) { const ad = Math.exp(-dt * 0.9); c.vx *= ad; c.vz *= ad; }
      const nx = g.position.x + c.vx * dt, nz = g.position.z + c.vz * dt;
      if (bulletBlocked(nx, nz)) { c.vx *= -0.35; c.vz *= -0.35; } else { g.position.x = nx; g.position.z = nz; }
      g.position.y += c.vy * dt; g.rotation.x += c.spin * dt; g.rotation.z += c.roll * dt;
      const fy = surfaceY(g.position.x, g.position.z);
      if (g.position.y < fy + c.r && c.vy < 0) {
        g.position.y = fy + c.r; c.bounces++;
        if (c.kind === 'mag') { if (c.bounces === 1) SFX.magDrop(Math.min(1, -c.vy / 4)); }
        else if (tinkT <= 0 && c.vy < -1.2) { SFX.tink(c.kind === 'shells', Math.min(1, -c.vy / 5) * (c.kind === 'link' ? 0.5 : 1)); tinkT = 0.035; }
        c.vy = -c.vy * (c.kind === 'mag' ? 0.2 : c.kind === 'shells' ? 0.25 : 0.38); c.vx *= 0.55; c.vz *= 0.55; c.spin *= 0.5; c.roll *= 0.4;
        if (c.vy < 0.5) c.bounces = 4;
        if (c.bounces >= 4) {   // settle on its side and roll a little
          if (c.rest) { c.rest(g); g.position.y = fy + c.restY; } else { g.rotation.x = Math.PI / 2; g.rotation.z = 0; g.position.y = fy + c.r; }
          c.vx *= 0.6; c.vz *= 0.6;
        }
      }
    } else if (Math.abs(c.vx) + Math.abs(c.vz) > 0.02) {
      const nx = g.position.x + c.vx * dt, nz = g.position.z + c.vz * dt;
      if (!bulletBlocked(nx, nz)) { g.position.x = nx; g.position.z = nz; }
      const f = Math.exp(-dt * 5); c.vx *= f; c.vz *= f; g.rotation.y += c.roll * dt * 0.3; c.roll *= f;
    }
    if (c.life < 0.6) g.scale.setScalar(Math.max(0.01, c.life / 0.6));
    if (c.life <= 0) g.visible = false;
  }
}
// pump and bolt guns cycle after the shot, worked hard, each time in one of a few ways picked at random (RACKS). The
// beats, as fractions of the cycle: a pump is yanked back to its stop (back), bounces there a hair (fwd), is shoved
// forward and slams home (home), and the gun settles. For a bolt the hand goes up to the handle (reach), snaps it up
// (lift), draws the bolt back hard (back), a hair's rest (fwd), drives it forward (home), slaps the handle down to lock
// it (lock) and goes back to the grip. The spent case flies out as the action hits its rear stop.
// Each way has its beats and timing (dur, delay), the curves of the stroke (ex: back, home), how the gun leans while
// it's worked (lean, per unit of how far the action's back (off), how much the hand's on the bolt (grab) or how far the
// handle's up (lift): p muzzle down, r roll, y yaw, z back into the shoulder, h down, w the torso's twist; player/hold.js
// puts the gun on a loose spring chasing it), where the hand takes the bolt knob (hand), and the knocks at each stop
// (gun: pitch, roll, back for rackKick in player/hold.js; cam: roll, push, zoom for rackCam in game/camera.js)
const RACKS = {
  pump: [
    // torn straight back, a bounce off the stop, shoved home; the muzzle dips and the gun cants a little
    { beat: { back: 0.3, fwd: 0.42, home: 0.7 }, dur: 0.44, delay: 0.08, ex: [1.35, 1.6],
      lean: { off: { p: 0.06, r: 0.07, z: -0.015, h: -0.012, w: -0.05 } },
      kick: { back: { gun: [1.3, 0.45, -0.45], cam: [0.14, -0.55, -0.12] }, home: { gun: [-1.7, -0.5, 0.55], cam: [-0.2, 0.8, 0.3] } } },
    // rolled right over onto its side, port up, and swung across the body as it's ripped back; rolled upright and
    // back on target as it's slammed home
    { beat: { back: 0.26, fwd: 0.4, home: 0.66 }, dur: 0.5, delay: 0.07, ex: [1.2, 1.8],
      lean: { off: { p: 0.05, r: 0.42, y: -0.12, z: -0.02, h: -0.035, w: -0.1 } },
      kick: { back: { gun: [0.8, 1.6, -0.4], cam: [0.22, -0.4, -0.1] }, home: { gun: [-1.4, -2.0, 0.5], cam: [-0.26, 0.7, 0.26] } } },
    // one quick snap of a stroke: the gun's pulled in tight and its muzzle flips up as the forend comes back, then it's
    // punched out at the slam
    { beat: { back: 0.2, fwd: 0.26, home: 0.48 }, dur: 0.4, delay: 0.06, ex: [1.1, 1.3],
      lean: { off: { p: -0.09, r: 0.03, y: 0.05, z: -0.035, h: 0.02, w: -0.03 } },
      kick: { back: { gun: [-0.9, 0.3, -0.6], cam: [0.1, -0.6, -0.15] }, home: { gun: [-1.2, -0.3, 1.0], cam: [-0.16, 1.0, 0.36] } } }
  ],
  bolt: [
    // deliberate: up, back, a beat, forward, down, the rifle staying on the shoulder with a little roll
    { beat: { reach: 0.12, lift: 0.23, back: 0.43, fwd: 0.51, home: 0.69, lock: 0.77 }, dur: 0.9, delay: 0.15, ex: [1.3, 1.5], hand: [-0.012, -0.004],
      lean: { grab: { r: -0.13, y: 0.03, h: -0.012 }, lift: { r: -0.05 }, off: { p: 0.04, z: -0.018, w: 0.04 } },
      kick: { up: { gun: [0, -0.35, 0], cam: [0.05, 0, 0] }, back: { gun: [0.8, 0.2, -0.4], cam: [0.11, -0.5, -0.1] },
        home: { gun: [-0.3, 0, 0.3], cam: [-0.05, 0.35, 0.08] }, lock: { gun: [-1.0, 0.7, 0.1], cam: [-0.14, 0.2, 0.16] } } },
    // one fast sweep: the handle flicked up and torn back in a single motion, then driven home and slapped down with
    // the heel of the hand coming over the top of the knob
    { beat: { reach: 0.1, lift: 0.17, back: 0.36, fwd: 0.4, home: 0.56, lock: 0.62 }, dur: 0.78, delay: 0.12, ex: [1.1, 1.7], hand: [-0.004, 0.016], sweep: 0.05,
      lean: { grab: { r: -0.08, y: -0.03, h: -0.006 }, lift: { r: -0.03 }, off: { p: 0, z: -0.026, w: 0.09 } },   // the muzzle stays on target
      kick: { back: { gun: [0.6, 0.3, -0.6], cam: [0.13, -0.6, -0.12] }, home: { gun: [-0.2, 0, 0.35], cam: [-0.04, 0.3, 0.06] },
        lock: { gun: [-1.3, 1.1, 0.15], cam: [-0.2, 0.25, 0.2] } } },
    // the rifle brought down off the shoulder and in toward the chest, rolled over hard, handle side up, to watch the
    // case fly, then put back up level to fire
    { beat: { reach: 0.14, lift: 0.25, back: 0.44, fwd: 0.5, home: 0.66, lock: 0.74 }, dur: 0.95, delay: 0.15, ex: [1.4, 1.4], hand: [-0.014, -0.008],
      lean: { grab: { r: -0.42, y: 0.16, h: -0.06, p: 0.05, z: -0.04 }, lift: { r: -0.04 }, off: { p: 0.03, z: -0.015, w: 0.03 } },
      kick: { up: { gun: [0, -0.5, 0], cam: [0.07, 0, 0] }, back: { gun: [0.7, -0.6, -0.35], cam: [0.18, -0.4, -0.08] },
        home: { gun: [-0.3, 0.2, 0.3], cam: [-0.05, 0.3, 0.06] }, lock: { gun: [-0.9, 1.4, 0.1], cam: [-0.22, 0.2, 0.14] } } }
  ]
};
// where the action is at q through the cycle: off how far back (0 home, 1 at the stop), lift how far the bolt handle
// is turned up, and grab how much the firing hand is on the bolt. A chambering cycle (chamberCycle) starts part way
// through with the bolt already open
function cyclePose(c, q) {
  const o = { off: 0, lift: 0, grab: 0 }, B = c.v.beat, ex = c.v.ex;
  const run = (q0, q1, f) => f(clamp((q - q0) / (q1 - q0), 0, 1));
  if (!c.bolt) {
    if (q < B.back) o.off = run(0, B.back, v => Math.pow(v, ex[0]));                                   // yanked back, quickest as it hits the stop
    else if (q < B.fwd) o.off = run(B.back, B.fwd, v => 1 - 0.08 * Math.sin(v * Math.PI) * (1 - v));   // a little bounce off it
    else if (q < B.home) o.off = run(B.fwd, B.home, v => 1 - Math.pow(v, ex[1]));                      // shoved forward, slamming home
    else o.off = run(B.home, 1, v => 0.05 * Math.sin(Math.min(1, v * 2.5) * Math.PI) * (1 - v));      // and a bounce off the front
    return o;
  }
  const q0 = c.q0 || 0;
  o.grab = smooth(clamp((q - q0) / B.reach, 0, 1)) * (1 - smooth(clamp((q - B.lock - 0.02) / (1 - B.lock - 0.02), 0, 1)));
  if (c.q0 && q < B.fwd) { o.lift = o.off = 1; return o; }                                              // already open
  if (q < B.reach) o.lift = 0;
  else if (q < B.lift) o.lift = run(B.reach, B.lift, v => 1 - (1 - v) * (1 - v));                     // snapped up
  else if (q < B.home) o.lift = 1;
  else if (q < B.lock) o.lift = run(B.home, B.lock, v => 1 - Math.pow(v, 1.5));                        // slapped down
  else o.lift = 0.1 * Math.sin(run(B.lock, B.lock + 0.12, v => v) * Math.PI);                          // and it bounces off the stock
  const sw = c.v.sweep || 0;   // a sweep starts drawing the bolt back before the handle's all the way up
  if (q < B.lift - sw) o.off = 0;
  else if (q < B.back) o.off = run(B.lift - sw, B.back, v => Math.pow(v, ex[0]));
  else if (q < B.fwd) o.off = run(B.back, B.fwd, v => 1 - 0.07 * Math.sin(v * Math.PI) * (1 - v));
  else if (q < B.home) o.off = run(B.fwd, B.home, v => 1 - Math.pow(v, ex[1]));
  return o;
}
// a pump or bolt gun has to be racked before it fires again: firing leaves it open (W8.open), and it's chambered when
// a rack drives the action home with a round to feed. A rack cut short (by a reload or a swap) leaves it open, and it's
// racked again as soon as your hands are free (tickCycle); weapons/firing.js won't fire it till then
const racked = id => EJECT[id] === 'pump' || EJECT[id] === 'bolt';
const needsRack = id => racked(id) && !!W8.open[id];
const rackLast = {};
function startCycle(id) {
  if (W8.cyc && !W8.cyc.done) ejectCasing(W(W8.cyc.id).ammo, 1, EJECT[W8.cyc.id]);
  const bolt = EJECT[id] === 'bolt', kind = bolt ? 'bolt' : 'pump', list = RACKS[kind];
  // a different way from last time
  let v = list[(rand() * list.length) | 0]; if (v === rackLast[kind]) v = list[(list.indexOf(v) + 1 + ((rand() * (list.length - 1)) | 0)) % list.length];
  rackLast[kind] = v;
  // the cycle fits inside the gun's fire rate, so a fast bolt or a slam-firing pump still racks fully between shots
  const r = W(id).rate / S.rateMul, k = Math.min(1, r / (v.dur + v.delay) * 0.92);
  W8.cyc = { id, t: 0, dur: v.dur * k, delay: v.delay * k, done: false, beat: 0, bolt, v, fx: cycleFx(v, bolt) }; W8.open[id] = true;
}
// on each beat: the sound, a knock to the gun's loose spring and to the camera's. [where, what]
function cycleFx(v, bolt) {
  const B = v.beat, K = v.kick, knock = k => { if (k) { rackKick(k.gun[0], k.gun[1], k.gun[2]); rackCam(k.cam[0], k.cam[1], k.cam[2]); } };
  if (!bolt) return [[B.back, () => { SFX.pumpBack(); knock(K.back); }], [B.home, () => { SFX.pumpHome(); knock(K.home); }]];
  return [[B.reach + 0.02, () => { SFX.boltUp(); knock(K.up); }], [B.back, () => { SFX.boltBack(); knock(K.back); }],
    [B.home, () => { SFX.boltHome(); knock(K.home); }], [B.lock, () => { SFX.boltLock(); knock(K.lock); }]];
}
// racking a gun that's open to chamber a round, with no case to throw: after a load (the rifle's bolt, open while it
// was fed, is only driven home and locked), or when a rack was cut short
function chamberCycle(id) {
  startCycle(id); const c = W8.cyc, B = c.v.beat; c.done = true; c.delay = 0.04;
  if (c.bolt && W8.boltOpen) { c.q0 = B.fwd - B.reach; c.t = c.delay + c.q0 * c.dur; while (c.beat < c.fx.length && c.fx[c.beat][0] < B.fwd) c.beat++; }
}
function tickCycle(dt) {
  { const id = curId(); if (!W8.cyc && needsRack(id) && (W8.mag[id] || 0) > 0 && !W8.reloading && !swapSt && !(P.bandT > 0) && !P.vault) { chamberCycle(id); W8.boltOpen = false; } }
  const c = W8.cyc; if (!c) return;
  if (curId() !== c.id) { if (!c.done) ejectCasing(W(c.id).ammo, 1, EJECT[c.id]); W8.cyc = null; return; }
  c.t += dt; const p = (c.t - c.delay) / c.dur, B = c.v.beat;
  // the case flies out as the action hits its rear stop
  if (!c.done && p >= B.back) { c.done = true; ejectCasing(W(c.id).ammo, 1, EJECT[c.id]); }
  while (c.beat < c.fx.length && p >= c.fx[c.beat][0]) c.fx[c.beat++][1]();
  // home: a round's chambered, if there was one to feed
  if (!c.homed && p >= B.home) { c.homed = true; if ((W8.mag[c.id] || 0) > 0) W8.open[c.id] = false; }
  if (p >= 1) W8.cyc = null;
}
