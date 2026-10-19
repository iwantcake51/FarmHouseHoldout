// Camera follow, aim pan, edge pan, scope view, shake and roll.

const camTarget = new V3(P.x, 0, P.z);
// the vault camera: roll, a vertical bob and a push along the jump, each a damped spring chasing a target that follows
// the jump's progress, so the view leans and settles smoothly instead of snapping or jittering. The push is a 2D spring
// (px, pz), so a new vault that starts before the last one has settled turns it round smoothly instead of flipping it
const camVault = { roll: 0, vr: 0, bob: 0, vb: 0, px: 0, vpx: 0, pz: 0, vpz: 0 };
// firing: each shot kicks the view on its own, apart from the gun's kick in the arms (player/hold.js): it tips only a
// little (mostly one way, like a gun climbing: CAM_ROLL, and less again on a full automatic, CAM_ROLL_AUTO, whose kicks
// come too fast to settle) and punches in a touch (CAM_PUNCH: how hard, by the gun's power, so a 9mm barely nudges and
// a shotgun or a rifle thumps), caught on stiff springs that bring it home quickly without wobbling. It doesn't slide
// back along the aim, which only followed the arms being shoved back. Only the heaviest guns rattle the screen
const camRec = { roll: 0, vr: 0, px: 0, vpx: 0, pz: 0, vpz: 0, zoom: 0, vz: 0 };
const CAM_ROLL = 0.22, CAM_ROLL_AUTO = 0.45, CAM_PUNCH = { zoom: 0.02, vz: 0.9, auto: 0.6 };
function fireCam(pw, aim, auto) {
  const c = camRec, sg = rand() < 0.7 ? 1 : -1, P_ = CAM_PUNCH, a = auto ? P_.auto : 1;
  c.vr += sg * pw * rr(0.5, 0.75) * CAM_ROLL * (auto ? CAM_ROLL_AUTO : 1);
  c.zoom += pw * P_.zoom * a; c.vz += pw * P_.vz * a;
  if (pw > 0.6) shake = Math.max(shake, 0.03 + (pw - 0.6) * 0.3);
}
// reloading: a small, smooth rotational jolt on each beat (mag out, mag seated, a shell in, the rack): the view rocks
// one way and settles, with only a whisper of push; seating a mag tips it the other way from pulling one
let reloadRockSide = 1;
function reloadJolt(s) {
  const c = camRec; reloadRockSide = -reloadRockSide;
  c.vr += reloadRockSide * s * rr(0.85, 1.1); c.vpx -= Math.sin(P.aim) * s * 0.15; c.vpz -= Math.cos(P.aim) * s * 0.15;
}
// working a pump or a bolt: a looser, slower sway than a shot's kick, so the view rides the rack and settles after it
// instead of snapping (weapons/casings.js knocks it on each beat): roll, a push along the aim (back toward you as the
// action's torn back, forward as it slams home) and a little zoom; it pushes less through a scope
const camRack = { roll: 0, vr: 0, px: 0, vpx: 0, pz: 0, vpz: 0, zoom: 0, vz: 0 };
function rackCam(roll, push, zm) {
  const c = camRack, k = 1 - 0.6 * (ANIM.scopeK || 0);
  c.vr += roll * rr(0.85, 1.15); c.vpx += Math.sin(P.aim) * push * k; c.vpz += Math.cos(P.aim) * push * k; c.vz += zm;
}
function springTo(o, key, vkey, target, k, damp, dt) { const a = -k * (o[key] - target) - damp * o[vkey]; o[vkey] += a * dt; o[key] += o[vkey] * dt; }
function vaultCam(rdt) {
  const v = P.vault, c = camVault;
  let roll = 0, bob = 0, push = 0;
  if (v) {
    if (v.t <= 0) { const k = smooth(clamp(v.pre / v.preDur, 0, 1)); roll = v.side * 0.02 * k; bob = -0.04 * k; }   // settle back the other way as you load the jump
    else { const h = Math.sin(Math.min(1, v.t) * Math.PI); roll = -v.side * 0.065 * h; bob = 0.05 * h; push = 0.16 * Math.min(1, v.t); }   // tip into the jump and back level by the landing
  }
  // small fixed steps so the springs stay smooth however long the frame was
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) {
    springTo(c, 'roll', 'vr', roll, 70, 11, dt); springTo(c, 'bob', 'vb', bob, 80, 10, dt);
    springTo(c, 'px', 'vpx', v ? v.dx * push : 0, 40, 11, dt); springTo(c, 'pz', 'vpz', v ? v.dz * push : 0, 40, 11, dt);
    springTo(camRec, 'roll', 'vr', 0, 130, 17, dt); springTo(camRec, 'zoom', 'vz', 0, 260, 27, dt);   // (stiff and near critically damped: the punch comes straight home, no wobble)
    springTo(camRec, 'px', 'vpx', 0, 230, 26, dt); springTo(camRec, 'pz', 'vpz', 0, 230, 26, dt);
    springTo(camRack, 'roll', 'vr', 0, 55, 6.5, dt); springTo(camRack, 'zoom', 'vz', 0, 70, 7, dt);
    springTo(camRack, 'px', 'vpx', 0, 60, 7.5, dt); springTo(camRack, 'pz', 'vpz', 0, 60, 7.5, dt);
  }
}
let titleSpin = 0;
const TITLE_ZOOM = 0.8;
// the cursor near an edge of the screen eases the view a little that way, so you can see a bit further where you're
// looking: from EDGE_IN of the way in from an edge, up to EDGE_PAN of the screen's height at the very edge
const EDGE_IN = 0.14, EDGE_PAN = 0.09, camEdge = { x: 0, y: 0 };
const edgeK = t => t < EDGE_IN ? -smooth(1 - t / EDGE_IN) : t > 1 - EDGE_IN ? smooth((t - 1 + EDGE_IN) / EDGE_IN) : 0;
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
    { const on = state === 'play' && hasMouse && !usingTouch && !P.dead && !introCamOn(), ex = on ? edgeK(clamp(mouseX / innerWidth, 0, 1)) : 0, ey = on ? edgeK(clamp(mouseY / innerHeight, 0, 1)) : 0;
      camEdge.x += (ex - camEdge.x) * Math.min(1, rdt * 3); camEdge.y += (ey - camEdge.y) * Math.min(1, rdt * 3);
      const m = EDGE_PAN * 2 * VIEW / zoom;   // screen right is RIGHT on the ground; screen down is back toward the camera, stretched by the tilt
      px += (RIGHT.x * camEdge.x - FWD.x * camEdge.y / Math.sin(EL)) * m; pz += (RIGHT.z * camEdge.x - FWD.z * camEdge.y / Math.sin(EL)) * m; }
    const fo = camFocus(), gx = fo.x + px - vd.x * k, gz = fo.z + pz - vd.z * k;   // (down in co-op: a teammate, net/sync.js)
    if (state === 'play') tickIntro(rdt);
    if (introCamOn()) introCam(gx, gz, rdt);   // the glide in at the start of a run (game/intro.js)
    else { camTarget.x += (gx - camTarget.x) * Math.min(1, rdt * 6); camTarget.z += (gz - camTarget.z) * Math.min(1, rdt * 6); }
  }
  if (!introCamOn()) zoom += (zoomT - zoom) * Math.min(1, rdt * 10);

  ANIM.ads = (ANIM.ads || 0) + ((aiming && !(P.skid > SPRINT.skid * 0.4) ? 1 : 0) - (ANIM.ads || 0)) * Math.min(1, rdt * 9);   // skidding out of a sprint, into the sights as you slow
  ANIM.scopeK = (ANIM.scopeK || 0) + ((scopeAim() ? SCOPES[T('sight')].view : 0) - (ANIM.scopeK || 0)) * Math.min(1, rdt * 7);
  cam.zoom = state === 'title' ? TITLE_ZOOM : zoom * (1 + 0.13 * ANIM.ads + 0.38 * ANIM.scopeK + 0.12 * (ANIM.healFx || 0));   // bandaging leans the view in slowly
  { const vo = (Math.round(ANIM.ads * 40) / 40).toFixed(3); if (cache.adsV !== vo) { cache.adsV = vo; $('adsVig').style.opacity = (vo * 0.8).toFixed(3); } }
  shake = Math.max(0, shake - rdt * 1.6);
  const sh = shake * shake * 1.2;
  const kf = Math.exp(-rdt * 16); camKick.x *= kf; camKick.z *= kf; camRoll *= Math.exp(-rdt * 4.5);
  const cc = P.conc || 0, wob = cc > 0 ? Math.sin(worldT * 2.38) * 0.05 * cc : 0;
  vaultCam(rdt); runCam();
  const cv = camVault, cr = camRec, ck = camRack, cu = camRun, vx = camKick.x + cv.px + cr.px + ck.px + cu.px, vz = camKick.z + cv.pz + cr.pz + ck.pz + cu.pz;
  camPunch *= Math.exp(-rdt * 9); cam.zoom *= 1 + cr.zoom * 0.35 + ck.zoom + camPunch;
  cam.position.set(camTarget.x + vx + CAM_OFF.x + rr(-sh, sh), CAM_OFF.y + cv.bob + cu.bob + rr(-sh, sh), camTarget.z + vz + CAM_OFF.z + rr(-sh, sh));
  cam.lookAt(camTarget.x + vx, cv.bob + cu.bob, camTarget.z + vz); cam.rotateZ(camRoll + wob + cv.roll + cr.roll + ck.roll + introRoll()); cam.updateProjectionMatrix();
}
