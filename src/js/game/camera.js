// Camera follow, aim pan, scope view, shake and roll.

const camTarget = new V3(P.x, 0, P.z);
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
    if (ads > 0.01) { px = (aimPt.x - P.x) * 0.42; pz = (aimPt.z - P.z) * 0.42; const pl = Math.hypot(px, pz); if (pl > 5.5) { px *= 5.5 / pl; pz *= 5.5 / pl; } px *= ads; pz *= ads; }
    const gx = P.x + px - vd.x * k, gz = P.z + pz - vd.z * k;
    camTarget.x += (gx - camTarget.x) * Math.min(1, rdt * 6); camTarget.z += (gz - camTarget.z) * Math.min(1, rdt * 6);
  }
  zoom += (zoomT - zoom) * Math.min(1, rdt * 10);

  ANIM.ads = (ANIM.ads || 0) + ((aiming ? 1 : 0) - (ANIM.ads || 0)) * Math.min(1, rdt * 9);
  cam.zoom = state === 'title' ? 0.8 : zoom * (1 + 0.13 * ANIM.ads);
  { const vo = (Math.round(ANIM.ads * 40) / 40).toFixed(3); if (cache.adsV !== vo) { cache.adsV = vo; $('adsVig').style.opacity = (vo * 0.8).toFixed(3); } }
  shake = Math.max(0, shake - rdt * 1.6);
  const sh = shake * shake * 1.2;
  const kf = Math.exp(-rdt * 16); camKick.x *= kf; camKick.z *= kf; camRoll *= Math.exp(-rdt * 4.5);
  const cc = P.conc || 0, wob = cc > 0 ? Math.sin(performance.now() / 420) * 0.05 * cc : 0;
  cam.position.set(camTarget.x + camKick.x + CAM_OFF.x + rr(-sh, sh), CAM_OFF.y + rr(-sh, sh), camTarget.z + camKick.z + CAM_OFF.z + rr(-sh, sh));
  cam.lookAt(camTarget.x + camKick.x, 0, camTarget.z + camKick.z); cam.rotateZ(camRoll + wob); cam.updateProjectionMatrix();
}
