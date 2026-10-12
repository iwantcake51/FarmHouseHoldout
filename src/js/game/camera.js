// Camera follow, aim pan, scope view, shake and roll.

const camTarget = new V3(P.x, 0, P.z);
// the vault camera: roll, a vertical bob and a push along the jump, each a damped spring chasing a target that follows
// the jump's progress, so the view leans and settles smoothly instead of snapping or jittering
const camVault = { roll: 0, vr: 0, bob: 0, vb: 0, push: 0, vp: 0, dx: 0, dz: 0 };
// firing: each shot kicks three springs, the view tipping (mostly one way, like a gun climbing), pushing back against
// the aim and punching in a touch; their size follows the gun's power, so a 9mm barely nudges and a rifle thumps
const camRec = { roll: 0, vr: 0, push: 0, vp: 0, zoom: 0, vz: 0, dx: 0, dz: 0 };
function fireCam(pw, aim) {
  const c = camRec, sg = rand() < 0.7 ? 1 : -1;
  c.dx = -Math.sin(aim); c.dz = -Math.cos(aim);
  c.vr += sg * pw * rr(0.5, 0.75); c.vp += pw * 2.1; c.vz += pw * 1.1;
  if (pw > 0.4) shake = Math.max(shake, 0.04 + (pw - 0.4) * 0.35);   // only heavy guns rattle the screen
}
// reloading: a small, smooth rotational jolt on each beat (mag out, mag seated, a shell in, the rack): the view rocks
// one way and settles, with only a whisper of push; seating a mag tips it the other way from pulling one
let reloadRockSide = 1;
function reloadJolt(s) {
  const c = camRec; reloadRockSide = -reloadRockSide;
  c.vr += reloadRockSide * s * rr(0.85, 1.1); c.vp += s * 0.15;
}
function springTo(o, key, vkey, target, k, damp, dt) { const a = -k * (o[key] - target) - damp * o[vkey]; o[vkey] += a * dt; o[key] += o[vkey] * dt; }
function vaultCam(rdt) {
  const v = P.vault, c = camVault;
  let roll = 0, bob = 0, push = 0;
  if (v) {
    c.dx = v.dx; c.dz = v.dz;
    if (v.t <= 0) { const k = smooth(clamp(v.pre / v.preDur, 0, 1)); roll = v.side * 0.02 * k; bob = -0.04 * k; }   // settle back the other way as you load the jump
    else { const h = Math.sin(Math.min(1, v.t) * Math.PI); roll = -v.side * 0.065 * h; bob = 0.05 * h; push = 0.16 * Math.min(1, v.t); }   // tip into the jump and back level by the landing
  }
  // small fixed steps so the springs stay smooth however long the frame was
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) {
    springTo(c, 'roll', 'vr', roll, 70, 11, dt); springTo(c, 'bob', 'vb', bob, 80, 10, dt); springTo(c, 'push', 'vp', push, 40, 11, dt);
    springTo(camRec, 'roll', 'vr', 0, 110, 12, dt); springTo(camRec, 'push', 'vp', 0, 150, 15, dt); springTo(camRec, 'zoom', 'vz', 0, 140, 14, dt);
  }
}
let titleSpin = 0;
// camera follow, aim pan, scope view, zoom, shake, kick and roll
function updateCamera(rdt) {
  if (state === 'title') { titleSpin += rdt * 0.08; camTarget.set(cxw(21) + Math.sin(titleSpin) * 3, 0, cxw(22) + Math.cos(titleSpin) * 3); }
  else if (scoped) {
    // put the scope point (at gun height) in the middle of the screen
    const vd = CAM_OFF.clone().normalize(), k = GUN_Y / vd.y, gx = scopePt.x - vd.x * k, gz = scopePt.z - vd.z * k;
    camTarget.x += (gx - camTarget.x) * Math.min(1, rdt * 14); camTarget.z += (gz - camTarget.z) * Math.min(1, rdt * 14);
    setT('scopeRng', Math.round(Math.hypot(scopePt.x - P.x, scopePt.z - P.z)) + ' m');
  }
  else {
    // keep the character's chest in the middle of the screen; no lead toward the aim, which used to drag the world under the cursor
    const vd = CAM_OFF.clone().normalize(), k = 0.85 / vd.y;
    // aiming down the sights leans the view a little toward where you're looking
    let px = 0, pz = 0; const ads = ANIM.ads || 0;
    // a scoped rifle leans the view further out toward the aim (and zooms in more, below)
    if (ads > 0.01) { const sk = ANIM.scopeK || 0, lean = 0.42 + 0.2 * sk, cap = 5.5 + 3 * sk; px = (aimPt.x - P.x) * lean; pz = (aimPt.z - P.z) * lean; const pl = Math.hypot(px, pz); if (pl > cap) { px *= cap / pl; pz *= cap / pl; } px *= ads; pz *= ads; }
    const gx = P.x + px - vd.x * k, gz = P.z + pz - vd.z * k;
    camTarget.x += (gx - camTarget.x) * Math.min(1, rdt * 6); camTarget.z += (gz - camTarget.z) * Math.min(1, rdt * 6);
  }
  zoom += (zoomT - zoom) * Math.min(1, rdt * 10);

  ANIM.ads = (ANIM.ads || 0) + ((aiming ? 1 : 0) - (ANIM.ads || 0)) * Math.min(1, rdt * 9);
  ANIM.scopeK = (ANIM.scopeK || 0) + ((scopeAim() ? (curId() === 'hunting' && hasMod('hpscope') ? 1.35 : 1) : 0) - (ANIM.scopeK || 0)) * Math.min(1, rdt * 7);
  cam.zoom = state === 'title' ? 0.8 : zoom * (1 + 0.13 * ANIM.ads + 0.38 * ANIM.scopeK);
  { const vo = (Math.round(ANIM.ads * 40) / 40).toFixed(3); if (cache.adsV !== vo) { cache.adsV = vo; $('adsVig').style.opacity = (vo * 0.8).toFixed(3); } }
  shake = Math.max(0, shake - rdt * 1.6);
  const sh = shake * shake * 1.2;
  const kf = Math.exp(-rdt * 16); camKick.x *= kf; camKick.z *= kf; camRoll *= Math.exp(-rdt * 4.5);
  const cc = P.conc || 0, wob = cc > 0 ? Math.sin(worldT * 2.38) * 0.05 * cc : 0;
  vaultCam(rdt);
  const cv = camVault, cr = camRec, vx = camKick.x + cv.dx * cv.push + cr.dx * cr.push, vz = camKick.z + cv.dz * cv.push + cr.dz * cr.push;
  cam.zoom *= 1 + cr.zoom * 0.35;
  cam.position.set(camTarget.x + vx + CAM_OFF.x + rr(-sh, sh), CAM_OFF.y + cv.bob + rr(-sh, sh), camTarget.z + vz + CAM_OFF.z + rr(-sh, sh));
  cam.lookAt(camTarget.x + vx, cv.bob, camTarget.z + vz); cam.rotateZ(camRoll + wob + cv.roll + cr.roll); cam.updateProjectionMatrix();
}
