// A suppressor heating up as you fire through it, purely for the look: each round through it warms it (more for a
// heavier round), and it bleeds the heat off on its own, quicker the hotter it is. Past a little warmth it starts to
// glow, a dull red at first, then orange, then yellow toward white as it gets really hot, and blooms; left alone it
// fades back down through the same colours. Each gun's can has its own heat. The glow's a thin shell over each of the
// can's pieces (heatPart, from weapons/attachments.js and the MP5SD's built-in can in weapons/models-smgs.js), its own
// shape drawn again in light on top of it.
import { GLOW_LAYER } from './post.js';

// shot: heat a round puts in (times 0.6 + its power, effects/tracers.js tracerPower); max: as hot as it gets; cool:
// what it sheds a second, plus coolHot of its heat (a hotter can cools faster); show: how hot before it starts to glow
const SUPP_HEAT = { shot: 0.034, max: 1.25, cool: 0.07, coolHot: 0.16, show: 0.16 };
// the glow's colour as it heats (0 just glowing to 1 white hot), and how bright at each
const HEAT_RAMP = [[0, [0.38, 0.03, 0.0]], [0.4, [0.95, 0.24, 0.03]], [0.75, [1.0, 0.56, 0.12]], [1, [1.0, 0.86, 0.5]]];
const HEAT = {}, MATS = {};
const matFor = id => MATS[id] || (MATS[id] = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, visible: false }));
// a piece of a can that glows with the heat of gun id's can
export function heatPart(m, id) {
  if (!m || !m.isMesh || !id) return m;
  const sh = new THREE.Mesh(m.geometry, matFor(id)); sh.castShadow = sh.receiveShadow = false; sh.userData.heatShell = true; sh.layers.enable(GLOW_LAYER);
  m.add(sh); return m;
}
// a round fired through gun id's can (pw: its power)
export function suppHeat(id, pw) { HEAT[id] = Math.min(SUPP_HEAT.max, (HEAT[id] || 0) + SUPP_HEAT.shot * (0.6 + (pw || 0.35))); }
function ramp(t, out) {
  let i = 0; while (i < HEAT_RAMP.length - 2 && t > HEAT_RAMP[i + 1][0]) i++;
  const [a, ca] = HEAT_RAMP[i], [b, cb] = HEAT_RAMP[i + 1], u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return out.setRGB(ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u);
}
let glowing = false;
// each frame: every can cooling, and its glow following its heat
export function stepSuppHeat(dt) {
  glowing = false;
  for (const id in HEAT) {
    let h = HEAT[id]; h = Math.max(0, h - (SUPP_HEAT.cool + SUPP_HEAT.coolHot * h) * dt); HEAT[id] = h;
    const M = MATS[id]; if (!M) continue;
    const t = Math.min(1, Math.max(0, (h - SUPP_HEAT.show) / (1 - SUPP_HEAT.show))), on = t > 0.002;
    M.visible = on; if (!on) continue;
    glowing = true;
    ramp(t, M.color).multiplyScalar(0.95 + 0.8 * t); M.opacity = Math.min(1, Math.pow(t, 0.8) * 1.05);
  }
}
// whether any can's glowing (the glow pass runs for it: effects/post.js)
export const heatGlowing = () => glowing;
