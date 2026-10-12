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
const _cv = new V3();
// mode: 'fire' flicks it out to the right, 'pump'/'bolt' a softer toss, 'breach' pops shells up and back, 'dump' drops them at your feet
function ejectCasing(ammo, n, mode, sideSign) {
  const K = CASE_KIND[ammo] || CASE_KIND.p9, fx = Math.sin(P.aim), fz = Math.cos(P.aim), rx = Math.cos(P.aim), rz = -Math.sin(P.aim);
  const D = W(curId()), ak = D && D.akimbo ? AKX * (sideSign || W8.akSide) : X, port = (MUZ[W8.cur] || 0.9) * (mode === 'breach' ? 0.18 : 0.38);
  PM.g.updateMatrixWorld(true);
  _cv.set(ak + 0.04, GUN_Y + 0.05, port); PM.upper.localToWorld(_cv);
  for (let k = 0; k < n; k++) {
    const c = casings[cIdx = (cIdx + 1) % casings.length];
    c.kind = ammo; c.r = K.r; c.len = K.len; c.bounces = 0; c.life = rr(7, 10);
    c.body.material = CMAT[K.body]; c.body.scale.set(K.r, K.len, K.r); c.body.position.set(0, 0, 0);
    c.head.scale.set(K.r * 1.08, K.body === 'hull' ? K.len * 0.28 : 0.008, K.r * 1.08); c.head.position.set(0, -K.len / 2 + (K.body === 'hull' ? K.len * 0.14 : 0.004), 0);
    c.g.position.copy(_cv); c.g.visible = true; c.g.scale.setScalar(1);
    c.g.rotation.set(rr(0, 3), P.aim + rr(-0.5, 0.5), rr(0, 3));
    let side, up, back;
    if (mode === 'fire') { side = rr(1.8, 2.8); up = rr(1.6, 2.5); back = rr(0.2, 0.8); }
    else if (mode === 'pump' || mode === 'bolt') { side = rr(1.6, 2.4); up = rr(1.6, 2.6); back = rr(0.0, 0.6); }
    else if (mode === 'breach') { side = rr(-0.4, 0.6); up = rr(2.4, 3.4); back = rr(1.2, 2.0); }
    else { side = rr(-0.5, 0.5); up = rr(0.2, 0.8); back = rr(-0.3, 0.4); c.g.position.y -= 0.12; }
    c.vx = rx * side - fx * back + P.vx * 0.8 + rr(-0.3, 0.3); c.vz = rz * side - fz * back + P.vz * 0.8 + rr(-0.3, 0.3); c.vy = up;
    c.spin = rr(9, 17) * (rand() < 0.5 ? -1 : 1); c.roll = rr(-6, 6);
  }
}
const mags = [];
for (let k = 0; k < 10; k++) { const g = new THREE.Group(); g.visible = false; scene.add(g); const body = new THREE.Mesh(UBOX_D, GM.metal2); body.castShadow = true; g.add(body); mags.push({ g, body, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, roll: 0, r: 0.03, bounces: 4, kind: 'mag' }); }
let mIdx = 0;
// the empty magazine falls out of the well when you start a reload, bounces and lies there a while
function dropMag(id) {
  const D = W(id), mp = MAGPOS[W8.cur]; if (!D || !mp) return;
  const gg = gunMeshes[W8.cur]; PM.g.updateMatrixWorld(true);
  const drum = T('mag') >= 2 && id !== 'pistol' && id !== 'deagle' || id === 'auto12', belt = id === 'lmg';
  const c = mags[mIdx = (mIdx + 1) % mags.length];
  let w = 0.05, h = 0.15, d = 0.07, mat = GM.metal2;
  if (id === 'deagle') { w = 0.06; h = 0.17; d = 0.08; }
  else if (id === 'smg' || id === 'sub') { w = 0.05; h = id === 'sub' && hasMod('stack') ? 0.38 : 0.24; d = 0.07; }
  else if (id === 'ar') { w = 0.06; h = 0.26; d = 0.1; }
  if (belt) { w = 0.17; h = 0.15; d = 0.17; mat = GM.olive; }
  c.body.geometry = drum ? DRUM_G : UBOX_D; c.body.material = mat;
  if (drum) { c.body.scale.set(belt ? 0.2 : 0.15, 0.12, belt ? 0.2 : 0.15); c.body.rotation.set(0, 0, Math.PI / 2); c.r = 0.075; c.rest = g => { g.rotation.set(0, g.rotation.y, 0); c.body.rotation.set(0, 0, 0); }; c.restY = 0.06; }
  else { c.body.scale.set(w, h, d); c.body.rotation.set(0, 0, 0); c.r = w / 2; c.rest = g => { g.rotation.set(0, g.rotation.y, Math.PI / 2); }; c.restY = w / 2; }
  _cv.set(mp[0], mp[1], mp[2]); gg.localToWorld(_cv);
  c.g.position.copy(_cv); c.g.rotation.set(0.2, P.aim, 0); c.g.scale.setScalar(1); c.g.visible = true;
  const fx = Math.sin(P.aim), fz = Math.cos(P.aim);
  c.vx = P.vx * 0.6 + fx * rr(0.2, 0.6) + rr(-0.3, 0.3); c.vz = P.vz * 0.6 + fz * rr(0.2, 0.6) + rr(-0.3, 0.3); c.vy = rr(-0.2, 0.6);
  c.spin = rr(3, 7) * (rand() < 0.5 ? -1 : 1); c.roll = rr(-4, 4); c.bounces = 0; c.life = 14; c.kind = 'mag';
}
function stepCasings(dt) { stepDebris(casings, dt); stepDebris(mags, dt); }
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
      if (g.position.y < c.r && c.vy < 0) {
        g.position.y = c.r; c.bounces++;
        if (c.kind === 'mag') { if (c.bounces === 1) SFX.magDrop(Math.min(1, -c.vy / 4)); }
        else if (tinkT <= 0 && c.vy < -1.2) { SFX.tink(c.kind === 'shells', Math.min(1, -c.vy / 5)); tinkT = 0.035; }
        c.vy = -c.vy * (c.kind === 'mag' ? 0.2 : c.kind === 'shells' ? 0.25 : 0.38); c.vx *= 0.55; c.vz *= 0.55; c.spin *= 0.5; c.roll *= 0.4;
        if (c.vy < 0.5) c.bounces = 4;
        if (c.bounces >= 4) {   // settle on its side and roll a little
          if (c.rest) { c.rest(g); g.position.y = c.restY; } else { g.rotation.x = Math.PI / 2; g.rotation.z = 0; g.position.y = c.r; }
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
// pump and bolt guns cycle after the shot; the spent case comes out mid-cycle
function startCycle(id) {
  if (W8.cyc && !W8.cyc.done) ejectCasing(W(W8.cyc.id).ammo, 1, EJECT[W8.cyc.id]);
  const bolt = EJECT[id] === 'bolt';
  W8.cyc = { id, t: 0, dur: bolt ? 0.62 : 0.42, delay: bolt ? 0.16 : 0.1, done: false, bolt };
}
function tickCycle(dt) {
  const c = W8.cyc; if (!c) return;
  if (curId() !== c.id) { if (!c.done) ejectCasing(W(c.id).ammo, 1, EJECT[c.id]); W8.cyc = null; return; }
  c.t += dt; const p = (c.t - c.delay) / c.dur;
  if (!c.done && p >= 0.45) { c.done = true; ejectCasing(W(c.id).ammo, 1, EJECT[c.id]); if (c.bolt) SFX.bolt(); else SFX.pump(); }
  if (p >= 1) W8.cyc = null;
}
