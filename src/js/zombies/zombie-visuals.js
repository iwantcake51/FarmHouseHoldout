// Zombies and corpses fading with your vision.

// zombies and corpses fading in and out of your vision. Their shadows never fade: the body stays in the scene
// (drawn with colour writes off once it's out of sight) so it keeps casting, and the blob under it stays put
const _eyeLive = new THREE.Color(EYE_COL), _eyeDead = new THREE.Color(0x2a2826);
function updateZombieVisuals(dt, rdt) {
  for (const z of zombies) {
    const v = state === 'title' ? 1 : visAt(z.x, z.z);
    z.vis += (v - z.vis) * Math.min(1, rdt * (v > z.vis ? 7 : 3.2)); z.m.g.visible = true;
    if (z.lastVis === undefined || Math.abs(z.lastVis - z.vis) > 0.008) { z.lastVis = z.vis; const shown = z.vis > 0.02 || !!z.redOl; (z.fade || Object.values(z.m.mats)).forEach(mt => { mt.opacity = z.vis; mt.depthWrite = z.vis > 0.05; mt.colorWrite = shown; }); if (z.om) z.om.opacity = z.vis * 0.5; if (z.xr) { z.xr.rim.opacity = z.vis; if (z.xr.sil) z.xr.sil.opacity = z.vis * 0.38; } if (z.blob) z.blob.material.opacity = 0.36; if (z.dm) z.dm.userData.u.value = 1; }
    if (z.redOl) z.redOl.opacity = 0.55 + Math.sin(worldT * 6.25) * 0.3;
  }
  for (let k = ragdolls.length - 1; k >= 0; k--) {
    const r = ragdolls[k]; stepRagdoll(r, dt);
    // the killing hit's flash cools off (it used to stay lit and leave the body glowing pale), and the eyes go out:
    // their glow fades over a second and a half and they dull to a dead grey
    if (r.flash > 0 || r.flashOn) { r.flash = Math.max(0, r.flash - dt); const k2 = r.flash / 0.14, m = r.m.mats; r.flashOn = r.flash > 0;
      for (const mt of [m.skin, m.shirt, m.pants]) if (mt) { if (r.flashOn) mt.emissive.setRGB(0.35 * k2 + 0.6 * k2 * k2, 0.1 * k2 + 0.55 * k2 * k2, 0.07 * k2 + 0.45 * k2 * k2); else mt.emissive.setHex(0); } }
    if (r.eyes && r.eyeT < 1.6) { r.eyeT += dt; const e = clamp(r.eyeT / 1.5, 0, 1); r.eyeGlow = Math.pow(1 - e, 1.5); r.eyes.forEach(o => o.material.color.copy(_eyeLive).lerp(_eyeDead, smooth(e))); }
    const v = visAt(r.x, r.z); r.vis += (v - r.vis) * Math.min(1, rdt * 10);
    Object.values(r.mats).forEach(mt => { mt.opacity = r.vis; mt.depthWrite = r.vis > 0.05; mt.colorWrite = r.vis > 0.03; }); if (r.dm) r.dm.userData.u.value = 1; if (r.blob) r.blob.material.opacity = 0.42 * Math.max(0, 1 - Math.max(0, r.t - 8) * 0.5);
    r.g.visible = true;
    if (r.t > 10) { scene.remove(r.g); if (r.blob) scene.remove(r.blob); ragdolls.splice(k, 1); }
  }
}
