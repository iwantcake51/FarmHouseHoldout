// Zombies and corpses fading with your vision, and the green rim on zombies in melee reach.

// zombies and corpses fading in and out of your vision. Their shadows go with them: the shadow-map depth is dithered
// away as they fade (fadeDepthMat, effects/outlines.js) and the soft blob under them fades too, so nothing you can't
// see gives itself away by its shadow
const _eyeLive = new THREE.Color(EYE_COL), _eyeDead = new THREE.Color(0x2a2826), _neckV = new V3();
// with a melee weapon out, the zombies your next swing would land on get a thin green rim that fades in as they come
// into reach and out as they leave it: everyone in the arc for a two-hander that cleaves, only the nearest for a
// one-hander (melee/melee.js). It fades with them, so it never shows a zombie you can't see.
const REACH_COL = 0x62e070, REACH_A = 0.6, BURN_COL = 0xff8a1e;
// the circle round you inside which a zombie behind something shows its outline: full strength up to RED_NEAR metres,
// then fading out the further it is, to nothing at RED_FAR
const RED_NEAR = 4, RED_FAR = 12;
// the flashlight's outline: how far (r) and how wide (half the cone, radians) each tier's beam picks zombies out
const LIGHT_OL = [null, { r: 13, half: 0.42 }, { r: 18, half: 0.62 }], LIGHT_COL = 0xfff1c4;
// the see-through rim and silhouette (effects/outlines.js) go from red to the same green while it's in reach, so one
// standing behind a tree or a wall still reads as in reach; a burning one is orange (BURN_COL)
const _xrRed = new THREE.Color(0xff3322), _xrSil = new THREE.Color(0xd8382a), _xrGreen = new THREE.Color(REACH_COL), _xrBurn = new THREE.Color(0xff8a1e);
function tintXray(z) {
  if (!z.xr) return;
  const g = z.reachA || 0, b = z.burnA || 0;
  z.xr.rim.color.copy(_xrRed).lerp(_xrBurn, b).lerp(_xrGreen, g);
  if (z.xr.sil) z.xr.sil.color.copy(_xrSil).lerp(_xrBurn, b * 0.8).lerp(_xrGreen, g * 0.8);
}
function markReach() {
  if (state !== 'play' || P.dead || P.vault || openSt || P.bandT > 0) return;
  const D = W(curId()); if (!D || !D.melee) return;
  for (const t of meleeTargets(D)) t.z.inReach = true;
}
function updateZombieVisuals(dt, rdt) {
  markReach();
  for (const z of zombies) {
    if (z.stain) z.stain.burn = z.burn;
    updateZombieStain(z.stain, rdt, dt);
    const v = state === 'title' ? 1 : visAt(z.x, z.z) * fogSee(z.x, z.z);   // and out past the edge, only as it comes clear of the fog
    z.vis += (v - z.vis) * Math.min(1, rdt * (v > z.vis ? 7 : 8));   // gone almost as quickly as it came
    // one you can't see draws nothing (no colour, its shadow dithered away, its rims faded), so it's left out of the
    // frame altogether rather than drawn invisibly: some sixty draws a zombie saved for every one out of sight
    z.m.g.visible = z.vis > 0.02 || !!z.redOl;
    if (z.lastVis === undefined || Math.abs(z.lastVis - z.vis) > 0.008) { z.lastVis = z.vis; const shown = z.vis > 0.02 || !!z.redOl; (z.fade || Object.values(z.m.mats)).forEach(mt => { mt.opacity = z.vis; mt.depthWrite = z.vis > 0.05; mt.colorWrite = shown; }); if (z.om) z.om.opacity = z.vis * 0.5; if (z.blob) z.blob.material.opacity = 0.36 * z.vis; if (z.dm) z.dm.userData.u.value = z.vis < 0.03 ? 0 : z.vis; }
    if (z.inReach || z.reachA > 0) {
      const on = !!z.inReach; z.inReach = false;
      z.reachA = (z.reachA || 0) + ((on ? 1 : 0) - (z.reachA || 0)) * Math.min(1, rdt * (on ? 9 : 5)); if (!on && z.reachA < 0.01) z.reachA = 0;
      if (!z.reachOl) z.reachOl = outline(z.m.g, 0, 0, 0.03, rimMat(REACH_COL));
      z.reachOl.opacity = z.reachA * REACH_A * z.vis; z.reachOl.visible = z.reachA > 0;
      if (z.om) z.om.opacity = z.vis * 0.5 * (1 - z.reachA);   // the pale crawler rim steps back while the green one shows
      tintXray(z);
    }
    // on fire: an orange rim that flickers with the flames, and the see-through outline goes orange too (tintXray)
    if (z.burn > 0 || z.burnA > 0) {
      z.burnA = (z.burnA || 0) + ((z.burn > 0 ? 1 : 0) - (z.burnA || 0)) * Math.min(1, rdt * (z.burn > 0 ? 8 : 2)); if (!(z.burn > 0) && z.burnA < 0.01) z.burnA = 0;
      if (!z.burnOl) z.burnOl = outline(z.m.g, 0, 0, 0.034, rimMat(BURN_COL));
      z.burnOl.opacity = z.burnA * z.vis * (0.5 + 0.22 * Math.sin(worldT * 17) * Math.sin(worldT * 7.3 + 1)) * (1 - 0.6 * (z.reachA || 0)); z.burnOl.visible = z.burnA > 0;
      tintXray(z);
    }
    // the outline seen through whatever stands in front of a zombie (the see-through rim and silhouette) shows only in a
    // circle round you: full strength up close, growing fainter the further out it is, gone at the circle's edge; past it
    // a zombie behind something is just hidden. The last few of a wave keep their pulsing outline, and their see-through
    // one, at any distance
    const near = 1 - smooth(clamp((Math.hypot(z.x - P.x, z.z - P.z) - RED_NEAR) / (RED_FAR - RED_NEAR), 0, 1)), rA = z.reachA || 0;
    if (z.xr) { const a = z.vis * Math.max(z.redOl ? 1 : near, rA); if (z.xr.rim.opacity !== a) { z.xr.rim.opacity = a; if (z.xr.sil) z.xr.sil.opacity = a * 0.6; } const on = a > 0.004; if (z.xr.rim.visible !== on) { z.xr.rim.visible = z.xr.fill.visible = on; if (z.xr.sil) z.xr.sil.visible = on; } }   // (out past the circle its three see-through layers aren't drawn at all)
    if (z.redOl) z.redOl.opacity = (0.55 + Math.sin(worldT * 6.25) * 0.3) * (1 - 0.7 * rA);
    // caught in your flashlight's beam after dark: a pale rim, full in the middle of the beam and soft at its edges and its
    // far end (the weapon light reaches further and wider than the taped one, LIGHT_OL)
    { const lt = T('light'), L = lt && LIGHT_OL[lt], dk = curDark;
      let a = 0;
      if (L && dk > 0.05 && !P.dead && flOn > 0) {
        const dx = z.x - P.x, dz = z.z - P.z, d = Math.hypot(dx, dz), off = Math.abs(angDiff(Math.atan2(dx, dz), P.aim));
        a = (1 - smooth(clamp((off - L.half * 0.75) / (L.half * 0.35), 0, 1))) * (1 - smooth(clamp((d - L.r * 0.7) / (L.r * 0.3), 0, 1))) * Math.min(1, dk * 1.6) * z.vis * 0.75 * flOn;
      }
      if (a > 0.01 && !z.lightOl) z.lightOl = outline(z.m.g, 0, 0, 0.022, rimMat(LIGHT_COL));
      if (z.lightOl) { z.lightOl.opacity = a; z.lightOl.visible = a > 0.01; } }
  }
  for (let k = ragdolls.length - 1; k >= 0; k--) {
    const r = ragdolls[k]; stepRagdoll(r, dt); if (r.stain) r.stain.burn = r.burn; updateZombieStain(r.stain, rdt, dt);
    // a head crushed by the sledgehammer (zombies/damage.js: crushHead): the neck pumps blood as the body goes down, weaker
    // as it runs out, and a pool spreads from it once it's down
    if (r.neck > 0) {
      r.neck -= dt; const v = r.g.localToWorld(_neckV.set(...STUMP.head));
      if (rand() < 0.65) burst(v.x, Math.max(0.15, v.y), v.z, 1 + (r.neck > 1.6 ? 1 : 0), 'blood', rr(-1, 1), rr(-1, 1), 0.6 + r.neck * 0.5);
      if (r.pooled && !r.neckPool) { r.neckPool = true; splat(v.x, v.z, 'pool', rr(0.8, 1.1), undefined, 2.4); }
    }
    // the killing hit's flash cools off (it used to stay lit and leave the body glowing pale), and the eyes go out:
    // their glow fades over a second and a half and they dull to a dead grey
    if (r.flash > 0 || r.flashOn) { r.flash = Math.max(0, r.flash - dt); const k2 = r.flash / 0.14, m = r.m.mats; r.flashOn = r.flash > 0;
      for (const mt of Object.values(m)) if (mt) { if (r.flashOn) mt.emissive.setRGB(0.35 * k2 + 0.6 * k2 * k2, 0.1 * k2 + 0.55 * k2 * k2, 0.07 * k2 + 0.45 * k2 * k2); else mt.emissive.setHex(0); } }
    if (r.eyes && r.eyeT < 1.6) { r.eyeT += dt; const e = clamp(r.eyeT / 1.5, 0, 1); r.eyeGlow = Math.pow(1 - e, 1.5); r.eyes.forEach(o => o.material.color.copy(_eyeLive).lerp(_eyeDead, smooth(e))); }
    const v = visAt(r.x, r.z); r.vis += (v - r.vis) * Math.min(1, rdt * 10);
    Object.values(r.mats).forEach(mt => { mt.opacity = r.vis; mt.depthWrite = r.vis > 0.05; mt.colorWrite = r.vis > 0.03; }); if (r.dm) r.dm.userData.u.value = r.vis < 0.03 ? 0 : r.vis; if (r.blob) r.blob.material.opacity = 0.42 * r.vis * Math.max(0, 1 - Math.max(0, r.t - 8) * 0.5);
    r.g.visible = r.vis > 0.03;   // (a body you can't see draws nothing either, as above)
    if (r.t > 10) { scene.remove(r.g); zFree(r.g); if (r.blob) scene.remove(r.blob); ragdolls.splice(k, 1); }
  }
}
