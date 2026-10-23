// Zombies and corpses fading with your vision, and the green rim on zombies in melee reach.

import { scene, V3 } from '../core/renderer.js';
import { angDiff, clamp, rand, rr, smooth } from '../core/math.js';
import { MIST, mistSee } from '../world/mist.js';
import { outline } from '../effects/screen-outlines.js';
import { P } from '../player/player.js';
import { updateZombieStain } from '../effects/body-blood.js';
import { curId, T, W } from '../game/run-state.js';
import { splat } from '../effects/blood-map.js';
import { burst } from '../effects/particles.js';
import { ragdolls, stepRagdoll } from './deaths.js';
import { STUMP, zombies } from './zombie-types.js';
import { zFree } from './zombie-looks.js';
import { fogSee } from './spawn.js';
import { rimMat } from '../effects/outlines.js';
import { openSt } from '../stations/station-ui.js';
import { state, worldT } from '../game/state.js';
import { meleeTargets } from '../melee/melee.js';
import { flDir, flOn, los, teamBeam } from '../lighting/lightmap.js';
import { curDark } from '../lighting/day-night.js';
import { peekOf, sightTo, visAt, visOn } from '../lighting/vision.js';
import { roofOver } from '../world/cutaway.js';
import { EYE_COL } from '../effects/eye-glow.js';
import { camFocus, viewer } from '../net/spectate.js';

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
export const LIGHT_OL = [null, { r: 13, half: 0.42 }, { r: 18, half: 0.62 }], LIGHT_COL = 0xfff1c4;
// how solid (z.vis) a zombie has to be before the rim starts to show, and by when it's full
const LIGHT_SOLID = [0.6, 0.92];
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
// a crowd in view costs some forty draws a zombie (its body, its body again into the sun's shadow map, and three
// see-through layers), so only the nearest few get the costly parts: a real shadow for the nearest ZLOD.shadow (the
// rest keep just the soft blob under them) and the see-through outline for the nearest ZLOD.xray. One already in the
// set keeps its place until another is ZLOD.keep metres nearer, so nothing flickers between two at the same distance
const ZLOD = { shadow: 8, xray: 8, keep: 1.5 }, _lod = [];
function zombieLOD() {
  const f = camFocus(); _lod.length = 0;
  for (const z of zombies) if (z.vis > 0.02 || z.redOl) { z.lodD = Math.hypot(z.x - f.x, z.z - f.z) - (z.shOn ? ZLOD.keep : 0); _lod.push(z); } else z.lodR = 1e9;
  _lod.sort((a, b) => a.lodD - b.lodD);
  for (let i = 0; i < _lod.length; i++) _lod[i].lodR = i;
  for (const z of zombies) {
    const on = z.lodR < ZLOD.shadow;
    if (z.shOn === on) continue;
    z.shOn = on;
    if (!z.casters) { z.casters = []; z.m.g.traverse(o => { if (o.isMesh && o.castShadow && !o.userData.isOutline) z.casters.push(o); }); }
    for (const o of z.casters) o.castShadow = on;
  }
}
export function updateZombieVisuals(dt, rdt) {
  markReach(); zombieLOD();
  const V = viewer(), pk = visOn && peekOf(V);   // (who's looking, and the window they're at: lighting/vision.js)
  for (const z of zombies) {
    if (z.stain) z.stain.burn = z.burn;
    updateZombieStain(z.stain, rdt, dt);
    // (and in co-op, picked out by a teammate's light even where you can't see: teamBeam, lighting/lightmap.js)
    // the fog's samples are half a metre apart, so one pressed to the far side of a wall can pick up the room's side of
    // it: so it's checked again where it really stands, past the walls and through the window you're at (sightTo), and
    // one behind a wall shows nothing, not even its outline through it
    const tb = state === 'title' ? 0 : teamBeam(z), f = state === 'title' ? 1 : visAt(z.x, z.z) * fogSee(z.x, z.z);   // and out past the edge, only as it comes clear of the fog
    const v = state === 'title' ? 1 : Math.max(f > 0.004 && visOn ? f * sightTo(V, pk, z.x, z.z) : f, tb) * (MIST.k > 0 ? mistSee(z.x, z.z) : 1);   // (and nothing of one out in a fog round's fog: world/mist.js)
    z.vis += (v - z.vis) * Math.min(1, rdt * (v > z.vis ? 7 : 8));   // gone almost as quickly as it came
    // one you can't see draws nothing (no colour, its shadow dithered away, its rims faded), so it's left out of the
    // frame altogether rather than drawn invisibly: some sixty draws a zombie saved for every one out of sight
    z.m.g.visible = z.vis > 0.02 || !!z.redOl;
    if (z.lastVis === undefined || Math.abs(z.lastVis - z.vis) > 0.008) { z.lastVis = z.vis; const shown = z.vis > 0.02 || !!z.redOl; (z.fade || Object.values(z.m.mats)).forEach(mt => { mt.opacity = z.vis; mt.depthWrite = z.vis > 0.05; mt.colorWrite = shown; }); if (z.om) z.om.opacity = z.vis * 0.5; if (z.blob) { z.blob.material.opacity = 0.36 * z.vis; z.blob.visible = z.vis > 0.01; } if (z.dm) z.dm.userData.u.value = z.vis < 0.03 ? 0 : z.vis; }
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
    // and only one in a straight line from you: one you make out by leaning to a window, along the outside of the wall
    // (sightTo's peek), stands behind that wall from up here, so its see-through outline would show through the wall
    if (z.xr) { const d = !visOn || z.vis < 0.004 || Math.hypot(z.x - V.x, z.z - V.z) <= 0.7 || los(V.x, V.z, z.x, z.z) ? 1 : 0; z.seeK = z.seeK === undefined ? d : z.seeK + (d - z.seeK) * Math.min(1, rdt * 8); }
    if (z.xr) { const lk = z.redOl || z.lodR < ZLOD.xray ? 1 : 0; z.xrK = z.xrK === undefined ? lk : z.xrK + (lk - z.xrK) * Math.min(1, rdt * 6); if (z.xrK < 0.01) z.xrK = 0; }   // (fading out as it drops out of the nearest few)
    if (z.xr) { const a = z.vis * Math.max(z.redOl ? 1 : near, rA) * smooth(clamp(roofOver(z.x, z.z), 0, 1)) * z.seeK * z.xrK; if (z.xr.rim.opacity !== a) { z.xr.rim.opacity = a; if (z.xr.sil) z.xr.sil.opacity = a * 0.6; } const on = a > 0.004; if (z.xr.rim.visible !== on) { z.xr.rim.visible = z.xr.fill.visible = on; if (z.xr.sil) z.xr.sil.visible = on; } }   // (out past the circle its three see-through layers aren't drawn at all)
    if (z.redOl) z.redOl.opacity = (0.55 + Math.sin(worldT * 6.25) * 0.3) * (1 - 0.7 * rA);
    // caught in your flashlight's beam after dark: a pale rim, full in the middle of the beam and soft at its edges and its
    // far end (the weapon light reaches further and wider than the taped one, LIGHT_OL)
    { const lt = T('light'), L = lt && LIGHT_OL[lt], dk = curDark;
      let a = 0;
      if (L && dk > 0.05 && !P.dead && flOn > 0) {
        const dx = z.x - P.x, dz = z.z - P.z, d = Math.hypot(dx, dz), off = Math.abs(angDiff(Math.atan2(dx, dz), flDir()));
        a = (1 - smooth(clamp((off - L.half * 0.75) / (L.half * 0.35), 0, 1))) * (1 - smooth(clamp((d - L.r * 0.7) / (L.r * 0.3), 0, 1))) * Math.min(1, dk * 1.6) * z.vis * 0.75 * flOn;
      }
      a = Math.max(a, tb * z.vis * 0.75);   // a teammate's light outlines it the same way
      // only once it's all but solid: through a body still fading in, every box's rim behind it shows (LIGHT_SOLID)
      a *= smooth(clamp((z.vis - LIGHT_SOLID[0]) / (LIGHT_SOLID[1] - LIGHT_SOLID[0]), 0, 1));
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
    Object.values(r.mats).forEach(mt => { mt.opacity = r.vis; mt.depthWrite = r.vis > 0.05; mt.colorWrite = r.vis > 0.03; }); if (r.dm) r.dm.userData.u.value = r.vis < 0.03 ? 0 : r.vis; if (r.blob) { r.blob.material.opacity = 0.42 * r.vis * Math.max(0, 1 - Math.max(0, r.t - 8) * 0.5); r.blob.visible = r.blob.material.opacity > 0.004; }
    r.g.visible = r.vis > 0.03;   // (a body you can't see draws nothing either, as above)
    if (r.t > 10) { scene.remove(r.g); zFree(r.g); if (r.blob) scene.remove(r.blob); ragdolls.splice(k, 1); }
  }
}
