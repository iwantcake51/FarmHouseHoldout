// Spent casings and dropped magazines, plus pump/bolt cycling.

import { cam, GUN_Y, scene, V3 } from '../core/renderer.js';
import { clamp, rand, rr, smooth } from '../core/math.js';
import { netSend } from '../net/net.js';
import { lam } from '../core/shaders.js';
import { surfaceY } from '../world/house.js';
import { bulletBlocked } from '../world/collision.js';
import { P, PM } from '../player/player.js';
import { roundOn } from './rounds.js';
import { curId, S, T, W, W8 } from '../game/run-state.js';
import { BRK, CRANE, flipOf, GM, gunMeshes, HOLDS, MAGG, MAGPOS, MUZ, X } from './gun-materials.js';
import { REV_CYL } from './gun-models.js';
import { partTex } from '../effects/textures.js';
import { smoke } from '../effects/smoke.js';
import { fx, portFx } from '../effects/puffs.js';
import { openSt } from '../stations/station-ui.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { mouseDown } from '../input/keyboard-mouse.js';
import { tStick } from '../input/touch.js';
import { MAG_DROP_T } from './reload.js';
import { rackCam } from '../game/camera.js';
import { ANIM } from '../player/animation.js';
import { holdOf } from '../player/hold.js';
import { rackKick } from '../player/hold-kick.js';
import { MAG_SLIDE } from '../player/hold-mags.js';
import { CHAMBERS, cylFired, cylLive, SL_DROPS } from '../player/hold-loaders.js';
import { swapSt } from '../player/swap.js';

// ---- spent casings: semi-autos and automatics throw brass on every shot, the pump and the bolt throw it when cycled,
// the double barrel and the revolver only drop theirs when opened to reload ----
export const EJECT = { pistol: 'fire', deagle: 'fire', smg: 'fire', sub: 'fire', ar: 'fire', lmg: 'fire', auto12: 'fire', scar: 'fire', pump: 'pump', hunting: 'bolt', dbl: 'breach', revolver: 'breach' };
// Each case is turned on a lathe from the real one's profile, in millimetres: from the firing pin's dent in the middle
// of the primer out across the head to the rim, up the outside past the extractor groove (a revolver's case has a rim
// standing proud instead), the shoulder and neck on a rifle's, over the mouth and back down inside to the web, each
// point [radius, height, colour] (two points in one place change the colour there). CASE_SCALE blows them up so they
// still read on the floor from up where the camera is. A fired shotgun hull is a brass head under a plastic tube, its
// crimp opened out into a star of folds (CASE_PLEAT).
const CC = { brass: 0xc29c45, head: 0xa38233, lip: 0xe6c66a, soot: 0x5c4420, inside: 0x3b2a10, primer: 0xc4bfae, pocket: 0x3a2c12, dent: 0x6c6452,
  hull: 0x931d15, hullLip: 0xb3301f, hullIn: 0x4f110a, wad: 0x8c8474 };
const caseBase = (pr, rim) => [[0, 0.32, 'dent'], [pr * 0.22, 0.26, 'dent'], [pr * 0.36, 0.07, 'dent'], [pr * 0.36, 0.07, 'primer'], [pr, 0.07, 'primer'], [pr, 0.07, 'pocket'],
  [pr + 0.12, 0, 'pocket'], [pr + 0.12, 0, 'head'], [rim - 0.32, 0, 'head'], [rim, 0.3, 'brass']];
const CASE_PROF = {
  // 9 mm Luger: rimless, straight, a touch of taper
  p9: { seg: 16, prof: [...caseBase(2.2, 4.98), [4.98, 1.0, 'brass'], [4.72, 1.27, 'brass'], [3.95, 1.45, 'brass'], [3.95, 2.0, 'brass'], [4.965, 2.85, 'brass'],
    [4.89, 14, 'brass'], [4.83, 19.0, 'soot'], [4.76, 19.15, 'lip'], [4.5, 19.15, 'lip'], [4.5, 19.15, 'inside'], [4.46, 18.6, 'inside'], [4.42, 5.6, 'inside'], [0, 5.2, 'inside']] },
  // 10mm Auto (the SMG's conversion kit): a 9mm's shape, rimless and straight, but fatter and a good deal longer
  p10: { seg: 16, prof: [...caseBase(2.2, 5.4), [5.4, 1.0, 'brass'], [5.13, 1.3, 'brass'], [4.3, 1.5, 'brass'], [4.3, 2.1, 'brass'], [5.39, 3.0, 'brass'],
    [5.33, 19, 'brass'], [5.28, 25.0, 'soot'], [5.2, 25.2, 'lip'], [4.93, 25.2, 'lip'], [4.93, 25.2, 'inside'], [4.89, 24.6, 'inside'], [4.84, 6.0, 'inside'], [0, 5.6, 'inside']] },
  // .50 AE, the hand cannon's: fat, with a rebated rim
  magnum: { seg: 16, prof: [...caseBase(2.65, 6.7), [6.7, 1.25, 'brass'], [6.45, 1.5, 'brass'], [5.6, 1.65, 'brass'], [5.6, 2.3, 'brass'], [6.95, 3.3, 'brass'],
    [6.92, 26, 'brass'], [6.88, 32.4, 'soot'], [6.8, 32.6, 'lip'], [6.5, 32.6, 'lip'], [6.5, 32.6, 'inside'], [6.45, 32, 'inside'], [6.4, 6.4, 'inside'], [0, 6, 'inside']] },
  // .357 Magnum, the revolver's: a rim standing proud and no groove
  rimmed: { seg: 16, prof: [...caseBase(2.2, 5.6), [5.6, 1.3, 'brass'], [5.42, 1.52, 'brass'], [4.82, 1.55, 'brass'],
    [4.8, 26, 'brass'], [4.78, 32.8, 'soot'], [4.7, 33, 'lip'], [4.45, 33, 'lip'], [4.45, 33, 'inside'], [4.42, 32.4, 'inside'], [4.4, 5.6, 'inside'], [0, 5.2, 'inside']] },
  // 7.62 NATO: tapered body, a sharp shoulder into the neck, soot down the neck from the shot
  rifle: { seg: 16, prof: [...caseBase(2.65, 5.95), [5.95, 1.1, 'brass'], [5.62, 1.37, 'brass'], [4.95, 1.55, 'brass'], [4.95, 2.4, 'brass'], [5.94, 3.6, 'brass'],
    [5.66, 38.9, 'brass'], [5.5, 39.8, 'brass'], [4.75, 42.4, 'brass'], [4.43, 43.4, 'soot'], [4.43, 47, 'soot'], [4.43, 50.85, 'soot'], [4.33, 51, 'lip'], [3.95, 51, 'lip'],
    [3.95, 51, 'inside'], [3.92, 50.5, 'inside'], [3.92, 43.6, 'inside'], [5.15, 39.4, 'inside'], [5.4, 8, 'inside'], [0, 7.4, 'inside']] },
  // a 12 gauge 2¾" hull: a brass head with a rim, the plastic over it, its fired crimp opened and flared a little
  shells: { seg: 24, pleat: [58, 69.5, 0.075], prof: [...caseBase(3.05, 11.3), [11.3, 1.25, 'brass'], [11.0, 1.48, 'brass'], [10.45, 1.52, 'brass'], [10.45, 15.4, 'brass'], [10.3, 15.9, 'brass'],
    [10.3, 15.9, 'hull'], [10.3, 58, 'hull'], [10.45, 64, 'hull'], [10.75, 69.5, 'hull'], [10.62, 70, 'hullLip'], [9.95, 70, 'hullLip'], [9.95, 70, 'hullIn'], [9.85, 69.4, 'hullIn'],
    [9.45, 62, 'hullIn'], [9.4, 19, 'hullIn'], [9.4, 19, 'wad'], [9.1, 18.4, 'wad'], [0, 18.2, 'wad']] }
};
const CASE_SCALE = { p9: 2.4, p10: 2.4, magnum: 2.4, rimmed: 2.4, rifle: 2.4, shells: 2 };
// a hull in the colour of the kind of shell (SHELL_MAT in weapons/gun-models.js): the same hull turned again with its
// plastic recoloured, white for flechettes, orange for dragon's breath, blue for slugs
const SHELL_HULL = { flech: 'W', fire: 'O', slug: 'B' };
Object.assign(CC, { hullW: 0xd8d4c8, hullLipW: 0xece8de, hullInW: 0x7a766c, hullO: 0xb8400e, hullLipO: 0xd2561a, hullInO: 0x52200a, hullB: 0x1a3f8a, hullLipB: 0x2c58a8, hullInB: 0x0a1a3a });
// a bullet's case by its kind of round (CASE_TINT): hollow points come in nickel cases, every calibre of them, turned
// again in silver (p9N, rifleN...), and explosive tips in blackened steel (magnumX)
const CASE_TINT = { hollow: 'N', boom: 'X' };
Object.assign(CC, { nickel: 0xc4c8cc, nickelHead: 0x9ea3a8, nickelLip: 0xe6e9ec, black: 0x2e2e32, blackHead: 0x232326, blackLip: 0x4a4a50 });
{ const TK = { N: { brass: 'nickel', head: 'nickelHead', lip: 'nickelLip' }, X: { brass: 'black', head: 'blackHead', lip: 'blackLip' } };
  for (const kd of ['p9', 'p10', 'magnum', 'rimmed', 'rifle']) for (const t in TK) { CASE_PROF[kd + t] = { ...CASE_PROF[kd], prof: CASE_PROF[kd].prof.map(v => TK[t][v[2]] ? [v[0], v[1], TK[t][v[2]]] : v) }; CASE_SCALE[kd + t] = CASE_SCALE[kd]; } }
for (const s of Object.values(SHELL_HULL)) { const q = CASE_PROF.shells; CASE_PROF['shells' + s] = { ...q, prof: q.prof.map(v => v[2].startsWith('hull') ? [v[0], v[1], v[2] + s] : v) }; CASE_SCALE['shells' + s] = CASE_SCALE.shells; }
// turn a profile round its axis into a mesh, centred on its middle with its base down -y: normals square to each band of
// the profile, so the rim, groove and shoulder keep their edges; a pleat ripples the radius CASE_PLEAT times round
const CASE_PLEAT = 8;
function turnCase({ prof, seg, pleat }, sc) {
  const L = Math.max(...prof.map(q => q[1])), pos = [], nor = [], col = [], cols = {}, k = sc / 1000;
  const colOf = n => cols[n] || (cols[n] = new THREE.Color(CC[n]));
  const pk = y => pleat ? pleat[2] * smooth(clamp((y - pleat[0]) / (pleat[1] - pleat[0]), 0, 1)) : 0;
  const vtx = (r, y, f, nr, ny, cn) => {
    const p = pk(y), R = r * (1 + p * Math.cos(CASE_PLEAT * f)), dR = -r * p * CASE_PLEAT * Math.sin(CASE_PLEAT * f), s = Math.sin(f), c = Math.cos(f);
    const nt = R > 1e-6 ? -nr * dR / R : 0, nx = nr * s + nt * c, nz = nr * c - nt * s, nl = Math.hypot(nx, ny, nz) || 1;
    return { p: [R * s * k, (y - L / 2) * k, R * c * k], n: [nx / nl, ny / nl, nz / nl], c: colOf(cn) };
  };
  for (let j = 0; j + 1 < prof.length; j++) {
    const [r0, y0, c0] = prof[j], [r1, y1, c1] = prof[j + 1], dl = Math.hypot(r1 - r0, y1 - y0); if (dl < 1e-6) continue;
    const nr = (y1 - y0) / dl, ny = -(r1 - r0) / dl;   // square to the band, pointing out of the brass
    for (let i = 0; i < seg; i++) {
      const fa = i / seg * Math.PI * 2, fb = (i + 1) / seg * Math.PI * 2;
      const A = vtx(r0, y0, fa, nr, ny, c0), B = vtx(r0, y0, fb, nr, ny, c0), C = vtx(r1, y1, fb, nr, ny, c1), D = vtx(r1, y1, fa, nr, ny, c1);
      // wound to face along the normal, judged on a triangle that isn't squeezed to nothing where a band meets the axis
      const [S1, S2] = r0 > 1e-6 ? [B, C] : [C, D];
      const ux = S1.p[0] - A.p[0], uy = S1.p[1] - A.p[1], uz = S1.p[2] - A.p[2], vx = S2.p[0] - A.p[0], vy = S2.p[1] - A.p[1], vz = S2.p[2] - A.p[2];
      const out = (uy * vz - uz * vy) * A.n[0] + (uz * vx - ux * vz) * A.n[1] + (ux * vy - uy * vx) * A.n[2] > 0;
      const tris = out ? [[A, B, C], [A, C, D]] : [[A, C, B], [A, D, C]];
      for (const t of tris) for (const v of t) { pos.push(...v.p); nor.push(...v.n); col.push(v.c.r, v.c.g, v.c.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// what each kind of round throws: the mesh, and its radius across the rim and length for the bounces and the glow
const CASE_KIND = {};
for (const kd in CASE_PROF) { const q = CASE_PROF[kd], sc = CASE_SCALE[kd]; CASE_KIND[kd] = { geo: turnCase(q, sc), r: Math.max(...q.prof.map(v => v[0])) * sc / 1000, len: Math.max(...q.prof.map(v => v[1])) * sc / 1000 }; }
const CMAT = lam(0xffffff, { vertexColors: true, emissive: 0x241a06 });
const UBOX_D = new THREE.BoxGeometry(1, 1, 1), DRUM_G = new THREE.CylinderGeometry(1, 1, 1, 14);
export const casings = [];
for (let k = 0; k < 90; k++) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ'; g.visible = false; scene.add(g);
  const body = new THREE.Mesh(CASE_KIND.p9.geo, CMAT); g.add(body);
  casings.push({ g, body, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, roll: 0, r: 0.02, bounces: 0, kind: 'p9' });
}
let cIdx = 0, tinkT = 0;
const _cv = new V3(), _cR = new V3(), _cU = new V3(), _cF = new V3();
// where each gun's spent brass comes out, in its own model's coordinates (weapons/gun-models.js): the middle of the
// ejection port on its right side, just proud of the face, so the case leaves from the port and not from somewhere
// along the barrel. On the hand cannon it's the mouth the slide opens between itself and the barrel block
const EJECT_PORT = {
  pistol: [X - 0.022, 1.149, 0.712], deagle: [X - 0.024, 1.162, 0.655], smg: [X - 0.03, 1.136, 0.64], sub: [X - 0.029, 1.145, 0.63],
  ar: [X - 0.031, 1.143, 0.668], lmg: [X - 0.039, 1.12, 0.52], auto12: [X - 0.041, 1.149, 0.705], pump: [X - 0.028, 1.151, 0.65],
  hunting: [X - 0.022, 1.143, 0.655], scar: [X - 0.03, 1.131, 0.688]
};
// the double barrel throws its empties as it falls open, and the revolver's slide out of the cylinder once it's swung
// out, not with the gun still shut: held here till the barrels are most of the way down or the cylinder most of the way
// out (ANIM.brk, ANIM.crane: player/hold.js), and given back to the gun if the reload's dropped first
let heldEject = null;
const openFor = mode => mode === 'breach' ? (BRK[W8.cur] ? ANIM.brk || 0 : 1) : mode === 'dump' ? ((CRANE[W8.cur] || []).length ? ANIM.crane || 0 : 1) : 1;
function tickHeldEject(dt) {
  const q = heldEject; if (!q) return;
  q.t += dt;
  if (curId() !== q.id || !W8.reloading) { W8.spent[q.id] = (W8.spent[q.id] || 0) + q.n; heldEject = null; return; }
  if (openFor(q.mode) < 0.8 && q.t < 0.6) return;
  heldEject = null; ejectCasing(q.ammo, q.n, q.mode, null, true);
}
// mode: 'fire' flicks it out of the port to the shooter's right, 'pump'/'bolt' flings it the same way, higher,
// 'breach' kicks shells out of the double barrel's chambers back over your shoulder, 'dump' drops them out of the
// revolver's cylinder at your feet. Everything starts where it really comes out of the posed gun
export function ejectCasing(ammo, n, mode, sideSign, now) {
  const id = curId(), BK = mode === 'breach' && BRK[W8.cur];
  if (!now && openFor(mode) < 0.8) { if (heldEject && heldEject.id === id) heldEject.n += n; else heldEject = { id, ammo, n, mode, t: 0 }; return; }
  const ch0 = mode === 'dump' ? Math.max(0, CHAMBERS - cylLive(id) - cylFired(id)) : 0;   // the fired chambers, below the loaded ones (cylHeads, player/hold.js)
  // a case the gun had kept (racked out, broken open, dumped from the cylinder) leaves the HUD as it leaves the gun
  if (mode !== 'fire') { const gid = (mode === 'pump' || mode === 'bolt') && W8.cyc ? W8.cyc.id : id; if (W8.hudSpent[gid]) W8.hudSpent[gid] = Math.max(0, W8.hudSpent[gid] - n); }
  const K = CASE_KIND[ammo === 'shells' ? 'shells' + (SHELL_HULL[roundOn(id)] || '') : (ammo === 'magnum' && id === 'revolver' ? 'rimmed' : ammo) + (CASE_TINT[roundOn(id)] || '')] || CASE_KIND.p9, D = W(id), side = D && D.akimbo && (sideSign || W8.akSide) < 0 ? 'L' : 'R';
  const right = mode === 'fire' || mode === 'pump' || mode === 'bolt';
  PM.g.updateMatrixWorld(true);
  const h = flipOf(holdOf(W8.cur, side)) || holdOf(W8.cur, side);   // (the gun's own frame: weapons/gun-materials.js, flipIn)
  // the gun's own axes in the world: the shooter's right is the gun's -x
  _cR.set(-1, 0, 0).transformDirection(h.matrixWorld); _cU.set(0, 1, 0).transformDirection(h.matrixWorld); _cF.set(0, 0, 1).transformDirection(h.matrixWorld);
  // the revolver's chambers, wherever the cylinder has swung out to on its crane; the double barrel's, on its barrels
  const cyl = mode === 'dump' && (CRANE[W8.cur] || []).find(c => c.parent === h), chambers = [];
  if (cyl && cyl.children[0]) { const cg = cyl.children[0]; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; chambers.push(cg.localToWorld(new V3(Math.cos(a) * REV_CYL.ch, Math.sin(a) * REV_CYL.ch, -0.045))); } _cF.set(0, 0, 1).transformDirection(cg.matrixWorld); }
  else if (BK) { BK.rims.forEach(r => chambers.push(r.getWorldPosition(new V3()))); _cF.set(0, 0, 1).transformDirection(BK.g.matrixWorld); }
  const pt = EJECT_PORT[id];
  if (pt) _cv.set(pt[0], pt[1], pt[2]); else _cv.set(X + (right ? -0.04 : 0.04), GUN_Y + 0.05, (MUZ[W8.cur] || 0.9) * (mode === 'breach' ? 0.18 : 0.38));
  h.localToWorld(_cv);
  if (right) portFx(_cv, _cR, mode === 'fire', ammo === 'shells');   // the gas and smoke out of the port (effects/puffs.js)
  for (let k = 0; k < n; k++) {
    const c = casings[cIdx = (cIdx + 1) % casings.length];
    c.kind = ammo; c.r = K.r; c.len = K.len; c.bounces = 0; c.life = rr(7, 10);
    c.body.geometry = K.geo;
    c.g.position.copy(chambers.length ? chambers[(ch0 + k) % chambers.length] : _cv); c.g.visible = true; c.g.scale.setScalar(1);
    c.g.rotation.set(rr(0, 3), P.aim + rr(-0.5, 0.5), rr(0, 3));
    let side, up, back;
    if (mode === 'fire') { side = rr(1.8, 2.8); up = rr(1.6, 2.5); back = rr(0.2, 0.8); }
    else if (mode === 'pump' || mode === 'bolt') { side = rr(2.3, 3.3); up = rr(2.2, 3.2); back = rr(0.2, 0.8); }   // racked out hard
    else if (mode === 'breach') { side = rr(-0.4, 0.6); up = rr(2.4, 3.4); back = rr(1.2, 2.0); }
    else {   // dump: the whole cylinder's worth slides out of the chambers together, each case falling its own way
      side = rr(-0.3, 1.1); up = rr(-0.2, 1.1); back = rr(-0.4, 0.8);
      if (!chambers.length) { c.g.position.y -= rr(0.04, 0.12); c.g.position.x += rr(-0.04, 0.04); c.g.position.z += rr(-0.04, 0.04); }
      c.g.rotation.set(rr(-0.6, 0.6) + Math.PI / 2, P.aim + rr(-1, 1), rr(-0.5, 0.5));
    }
    // right is toward the shooter's right for every mode; the breach and dump modes keep their old feel through their own numbers
    const sx = right ? side : -side;
    c.vx = _cR.x * sx + _cU.x * up * 0.15 - _cF.x * back + P.vx * 0.8 + rr(-0.3, 0.3); c.vz = _cR.z * sx + _cU.z * up * 0.15 - _cF.z * back + P.vz * 0.8 + rr(-0.3, 0.3); c.vy = up;
    if (mode === 'breach' && chambers.length) c.vy = up * 0.7 - _cF.y * back;   // kicked out along the bores, which point up at you with the barrels down
    c.spin = rr(9, 17) * (rand() < 0.5 ? -1 : 1); c.roll = rr(-6, 6);
    c.age = 0; c.hot = right || mode === 'breach' ? 1 : 0.4;   // freshly fired brass: a glowing trail and a thread of smoke for a moment
  }
}
// a hot casing leaves a short glowing streak drawn out along its flight (one of the trace sprites, turned to its
// motion on screen) and a thread of smoke for its first moments in the air
// (made on first use: the sprites are loaded in effects/textures.js, which loads after this file)
let caseGlows = null, cgIdx = 0;
const _cg = new V3(), _cg2 = new V3();
function stepCaseTrails(dt) {
  if (!caseGlows) { caseGlows = []; const mat = new THREE.SpriteMaterial({ map: partTex('trace2'), color: 0xff9a48, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); for (let k = 0; k < 110; k++) { const s = new THREE.Sprite(mat.clone()); s.visible = false; scene.add(s); caseGlows.push({ s, t: 0, max: 0.2 }); } }
  for (const c of casings) {
    if (c.life <= 0 || c.age === undefined || c.age > 0.45 || c.kind === 'mag') continue;
    c.age += dt; if (c.bounces >= 1 || dt <= 0) continue;
    const g = caseGlows[cgIdx = (cgIdx + 1) % caseGlows.length], p = c.g.position, heat = c.hot * (1 - c.age / 0.45);
    g.s.position.copy(p); g.s.visible = true; g.t = g.max = 0.1 + 0.08 * heat; g.a = 0.95 * heat;
    // laid along the way it's flying on screen, as long as it goes in a few hundredths of a second
    _cg.copy(p).project(cam); _cg2.set(p.x + c.vx * 0.03, p.y + c.vy * 0.03, p.z + c.vz * 0.03).project(cam);
    g.s.material.rotation = Math.atan2((_cg2.y - _cg.y) * innerHeight, (_cg2.x - _cg.x) * innerWidth);
    g.len = (0.04 + Math.hypot(c.vx, c.vy, c.vz) * 0.025) / 0.6; g.th = (c.kind === 'shells' ? 0.14 : 0.1) * (0.6 + heat * 0.5);
    if (c.wisp === undefined || c.age > c.wisp) { c.wisp = c.age + 0.06; smoke(p.x, p.y, p.z, c.vx * 0.05, 0.14, c.vz * 0.05, 0.02, rr(0.08, 0.12), rr(0.5, 0.8), 0.14 * heat + 0.04, 0xc8c0b2); }
  }
  for (const g of caseGlows) {
    if (g.t <= 0) continue; g.t -= dt;
    if (g.t <= 0) { g.s.visible = false; continue; }
    const k = g.t / g.max; g.s.material.opacity = g.a * k; g.s.scale.set(g.len * (0.5 + 0.5 * k), g.th, 1);
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
export function ejectLinks(n, z) {
  PM.g.updateMatrixWorld(true);
  const h = flipOf(holdOf(W8.cur, 'R')) || holdOf(W8.cur, 'R');
  _cR.set(-1, 0, 0).transformDirection(h.matrixWorld); _cF.set(0, 0, 1).transformDirection(h.matrixWorld);
  _cv.set(X - 0.036, GUN_Y + 0.025, z); h.localToWorld(_cv);
  for (let k = 0; k < n; k++) {
    const c = links[lIdx = (lIdx + 1) % links.length], side = rr(1.1, 1.9), up = rr(1.4, 2.2), back = rr(-0.2, 0.3);
    c.g.position.copy(_cv); c.g.visible = true; c.g.scale.setScalar(1); c.g.rotation.set(rr(0, 3), P.aim + rr(-0.6, 0.6), rr(0, 3));
    c.vx = _cR.x * side - _cF.x * back + P.vx * 0.8 + rr(-0.25, 0.25); c.vz = _cR.z * side - _cF.z * back + P.vz * 0.8 + rr(-0.25, 0.25); c.vy = up;
    c.spin = rr(10, 18) * (rand() < 0.5 ? -1 : 1); c.roll = rr(-7, 7); c.bounces = 0; c.life = rr(7, 10);
  }
}
export function stepCasings(dt) { tickHeldEject(dt); stepDebris(casings, dt); stepDebris(mags, dt); stepDebris(SL_DROPS, dt); stepDebris(links, dt); stepCaseTrails(dt); }
export const mags = [];
// each is a body (a box mag, or a drum) and, on a drum, the stick that runs up out of it into the magwell (neck), both in
// a pivot that turns a drum onto its flat face when it settles, the neck lying out to the side
for (let k = 0; k < 10; k++) {
  const g = new THREE.Group(), pv = new THREE.Group(); g.visible = false; scene.add(g); g.add(pv);
  const body = new THREE.Mesh(UBOX_D, GM.metal2), neck = new THREE.Mesh(UBOX_D, GM.metal2); body.castShadow = neck.castShadow = true; pv.add(body, neck);
  const model = new THREE.Group(); pv.add(model);   // (or a copy of the gun's own magazine: placeMag)
  mags.push({ g, pv, body, neck, model, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, roll: 0, r: 0.03, bounces: 4, kind: 'mag' });
}
let mIdx = 0;
// the empty magazine falls out of the well when you start a reload, bounces and lies there a while
export function dropMag(id, side) {
  const D = W(id), mp = MAGPOS[W8.cur]; if (!D || !mp) return;
  const gg = gunMeshes[W8.cur]; PM.g.updateMatrixWorld(true);
  // the mag that falls is the one on the model (weapons/gun-models.js): its size across, down and along the gun, or a
  // drum (its radius and thickness, and which way its axis runs: along the gun or across it)
  const mt = T('mag');
  let w = 0.05, h = 0.15, d = 0.07, mat = 'metal2', dr = null;
  if (id === 'pistol') { if (mt >= 3) dr = { r: 0.08, t: 0.072, ax: 'z' }; else { w = 0.024; h = [0.15, 0.17, 0.33][mt]; d = 0.055; mat = 'poly'; } }
  else if (id === 'deagle') { w = 0.026; h = [0.17, 0.22, 0.32][Math.min(2, mt)]; d = 0.065; }
  else if (id === 'smg') { if (mt >= 3) dr = { r: 0.08, t: 0.056, ax: 'x' }; else { w = 0.028; h = 0.29 + 0.05 * mt; d = 0.06; mat = 'poly'; } }
  else if (id === 'sub' && D.tenmm) { w = 0.026; h = 0.27; d = 0.05; mat = 'poly'; }   // (the 10mm kit's straight 30-rounder: gun-models.js, MP5_MAG10)
  else if (id === 'sub') { w = 0.026; h = [0.24, 0.29, 0.34, 0.4][mt]; d = 0.042; }
  else if (id === 'ar') { if (mt >= 2) dr = { r: mt >= 3 ? 0.15 : 0.115, t: mt >= 3 ? 0.12 : 0.1, ax: 'x' }; else { w = 0.046; h = mt === 1 ? 0.26 : 0.2; d = 0.104; } }
  else if (id === 'auto12') { if (mt >= 1) dr = { r: 0.114, t: 0.078, ax: 'z' }; else { w = 0.05; h = 0.215; d = 0.095; } }   // the drum, or its box
  else if (id === 'lmg') { w = 0.1; h = 0.22 + 0.03 * mt; d = 0.174; mat = 'olive'; }
  else if (id === 'scar' && D.akKit) { w = 0.05; h = 0.25; d = 0.09; mat = 'poly'; }   // (the AK kit's curved 30-rounder: gun-models.js, AKM_KIT)
  else if (id === 'scar') { w = 0.048; h = mt ? 0.18 : 0.105; d = 0.104; mat = 'fdeP'; }
  // an akimbo pair's left gun drops its own mag, from its own hand
  if (side === 'L' && HOLDS[W8.cur] && HOLDS[W8.cur].L) { const h = HOLDS[W8.cur]; _cv.set(mp[0] - h.R.position.x, mp[1], mp[2]); h.L.localToWorld(_cv); }
  else if (side === 'R' && HOLDS[W8.cur] && HOLDS[W8.cur].L) { const h = HOLDS[W8.cur]; _cv.set(mp[0] - h.R.position.x, mp[1], mp[2]); h.R.localToWorld(_cv); }
  else { _cv.set(mp[0], mp[1], mp[2]); gg.localToWorld(_cv); }
  const fx = Math.sin(P.aim), fz = Math.cos(P.aim);
  // falling on down the gun's axis at the speed it was sliding out of the well (MAG_SLIDE over MAG_DROP_T, eased in:
  // player/hold.js), so it never stops between the two
  _cd.set(0, -1, 0).transformDirection(gg.matrixWorld).multiplyScalar(2 * MAG_SLIDE / MAG_DROP_T);
  // it slips out of the well and drops: carried on with you, barely pushed (DROP_PUSH), tumbling slowly, so it leaves the
  // gun where the gun's mag was rather than leaping away from it
  const m = { shape: dr ? [dr.r, dr.t, dr.ax, id === 'pistol' ? 1 : 0] : [w, h, d], mat, p: [_cv.x, _cv.y, _cv.z].map(v => Math.round(v * 1000) / 1000), ry: Math.round(P.aim * 100) / 100, s: W8.cur, sd: side === 'L' ? 1 : 0,
    v: [P.vx * 0.9 + fx * rr(0, DROP_PUSH) + _cd.x, _cd.y, P.vz * 0.9 + fz * rr(0, DROP_PUSH) + _cd.z].map(v => Math.round(v * 100) / 100), slow: 1, spin: Math.round(rr(3, 7) * (rand() < 0.5 ? -1 : 1) * 100) / 100, roll: Math.round(rr(-4, 4) * 100) / 100 };
  placeMag(m, (MAGG[W8.cur] || [])[m.sd]);
  netSend('md', m);   // (co-op: it falls out of your survivor on your teammates' screens too, net/arsenal.js)
}
// a falling mag, from where and how it was let go (yours, or a co-op teammate's): a copy of the gun's own magazine
// (src: its group on the model, weapons/build-weapons.js), the same pieces and colours, starting exactly where it was
// on the gun; or, without one, a plain one of the shape and colour given
const DROP_PUSH = 0.15, _cd = new V3();
const _mgB = new THREE.Box3(), _mgC = new V3(), _mgS = new V3(), _mgQ = new THREE.Quaternion();
export function placeMag(m, src) {
  const c = mags[mIdx = (mIdx + 1) % mags.length];
  while (c.model.children.length) c.model.remove(c.model.children[0]);   // (the copy shares the model's geometry: nothing to free)
  if (src && src.children.length) {
    const cp = src.clone(true); cp.position.set(0, 0, 0); cp.quaternion.identity(); cp.scale.set(1, 1, 1); cp.visible = true; cp.updateMatrixWorld(true);
    _mgB.setFromObject(cp); if (!_mgB.isEmpty()) {
      _mgB.getCenter(_mgC); _mgB.getSize(_mgS); cp.position.copy(_mgC).negate();
      src.updateWorldMatrix(true, false); src.matrixWorld.decompose(c.g.position, _mgQ, c.g.scale); c.g.position.copy(_mgC).applyMatrix4(src.matrixWorld);
      c.model.add(cp); c.body.visible = c.neck.visible = false; c.pv.rotation.set(0, 0, 0);
      c.g.quaternion.copy(_mgQ); c.g.scale.setScalar(1); c.g.visible = true;
      const th = _mgS.x / 2; c.r = th + 0.005; c.restY = th; c.rest = g => { g.rotation.set(0, g.rotation.y, Math.PI / 2); };   // down on its side
      c.vx = m.v[0]; c.vy = m.v[1]; c.vz = m.v[2]; c.spin = m.spin * (m.slow ? 0.4 : 1); c.roll = m.roll * (m.slow ? 0.4 : 1); c.bounces = 0; c.life = 14; c.kind = 'mag'; c.settle = null;
      return;
    }
  }
  c.body.visible = true;
  const mat = GM[m.mat] || GM.metal2, dr = m.shape.length === 4 ? { r: m.shape[0], t: m.shape[1], ax: m.shape[2] } : null, small = m.shape[3] === 1;
  const [w, h, d] = m.shape;
  c.body.geometry = dr ? DRUM_G : UBOX_D; c.body.material = c.neck.material = mat; c.pv.rotation.set(0, 0, 0); c.neck.visible = !!dr;
  if (dr) {
    // the drum, its axis along or across the gun, and its stick standing up out of it, as long as the drum's radius
    c.body.scale.set(dr.r, dr.t, dr.r); c.body.rotation.set(dr.ax === 'z' ? Math.PI / 2 : 0, 0, dr.ax === 'x' ? Math.PI / 2 : 0);
    const nh = dr.r * 1.05, nw = small ? 0.026 : 0.044, nd = small ? 0.05 : 0.07;
    c.neck.scale.set(dr.ax === 'x' ? Math.min(nw, dr.t * 0.8) : nw, nh, dr.ax === 'z' ? Math.min(nd, dr.t * 0.8) : nd); c.neck.position.set(0, dr.r * 0.75 + nh / 2, 0);
    c.r = dr.r * 0.6; c.restY = dr.t / 2;
    c.rest = g => { g.rotation.set(0, g.rotation.y, 0); c.pv.rotation.set(dr.ax === 'z' ? -Math.PI / 2 : 0, 0, dr.ax === 'x' ? Math.PI / 2 : 0); };   // flat on its face
  }
  else { c.body.scale.set(w, h, d); c.body.rotation.set(0, 0, 0); c.r = w / 2; c.rest = g => { g.rotation.set(0, g.rotation.y, Math.PI / 2); }; c.restY = w / 2; }
  c.g.position.set(m.p[0], m.p[1], m.p[2]); c.g.rotation.set(0.2, m.ry, 0); c.g.scale.setScalar(1); c.g.visible = true;
  c.vx = m.v[0]; c.vy = m.v[1]; c.vz = m.v[2]; c.spin = m.spin; c.roll = m.roll; c.bounces = 0; c.life = 14; c.kind = 'mag'; c.settle = null;
}
// a mag coming to rest: it tips over onto whichever of its sides is nearest the way it landed (the rest pose turned half
// a turn round any of its axes lies just as flat), over MAG_SETTLE seconds, rather than snapping onto it
const MAG_SETTLE = 0.24, _stO = new THREE.Object3D(), _stQ = new THREE.Quaternion(), _stF = [new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)];
function settleMag(c, g, fy) {
  _stO.rotation.copy(g.rotation); if (c.rest) c.rest(_stO); else _stO.rotation.set(Math.PI / 2, g.rotation.y, 0);
  const base = _stO.quaternion.clone(); let best = base.clone(), bd = Math.abs(base.dot(g.quaternion));
  for (const ax of _stF) { const q = base.clone().multiply(_stQ.setFromAxisAngle(ax, Math.PI)), d = Math.abs(q.dot(g.quaternion)); if (d > bd) { bd = d; best = q; } }
  c.settle = { t: 0, q0: g.quaternion.clone(), q1: best, y0: g.position.y, y1: fy + (c.rest ? c.restY : c.r) };
}
// a board, a plate or a bar of a grate, or a flake off one, coming to rest: from however it landed, turned the least
// it can be to lie flat (a board or a plate face down, its thin side up; a bar on its side) and eased down there over
// FLAT_SETTLE, keeping the way it was pointing, so it never snaps round
const FLAT_KINDS = new Set(['plank', 'plate', 'bar', 'flake']), FLAT_SETTLE = 0.16, _sfA = new V3(), _sfB = new V3();
function settleFlat(c, g, fy) {
  const bar = c.kind === 'bar', q = g.quaternion, a = _sfA.set(0, bar ? 1 : 0, bar ? 0 : 1).applyQuaternion(q).normalize();
  if (bar) { _sfB.set(a.x, 0, a.z); if (_sfB.lengthSq() < 1e-6) _sfB.set(1, 0, 0); _sfB.normalize(); } else _sfB.set(0, a.y < 0 ? -1 : 1, 0);
  const q1 = new THREE.Quaternion().setFromUnitVectors(a, _sfB).multiply(q);
  c.settle = { t: 0, q0: q.clone(), q1, y0: g.position.y, y1: fy + (c.rest ? c.restY : c.r), dur: FLAT_SETTLE };
}
export function stepDebris(list, dt) {
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
        else if (c.kind === 'plate' || c.kind === 'bar') { if (c.bounces <= 2 && Math.hypot(g.position.x - P.x, g.position.z - P.z) < 18) soundAt(g.position.x, g.position.z, () => SFX.metalDrop(Math.min(1, -c.vy / 4), c.kind === 'plate')); }   // (a grate coming apart: barricades/metal-bars.js)
        else if (c.kind === 'plank') { if (!c.quiet && c.bounces <= 2 && Math.hypot(g.position.x - P.x, g.position.z - P.z) < 16) SFX.plankDrop(Math.min(1, -c.vy / 4)); }   // (a board torn off a window: barricades/planks.js)
        else {
          if (tinkT <= 0 && c.vy < -1.2) { SFX.tink(c.kind === 'shells', Math.min(1, -c.vy / 5) * (c.kind === 'link' ? 0.5 : 1)); tinkT = 0.035; }
          if (c.bounces === 1 && c.kind !== 'link' && c.vy < -1.5 && rand() < 0.6) fx('dust', g.position.x, fy + 0.04, g.position.z, c.vx * 0.2, rr(0.1, 0.3), c.vz * 0.2, 0.04, rr(0.12, 0.18), rr(0.35, 0.5), 0.2);   // a little dust kicked up where a case lands
        }
        c.vy = -c.vy * (c.kind === 'mag' ? 0.2 : c.kind === 'shells' ? 0.25 : 0.38); c.vx *= 0.55; c.vz *= 0.55; c.spin *= 0.5; c.roll *= 0.4;
        if (c.vy < 0.5) c.bounces = 4;
        if (c.bounces >= 4) {   // settle on its side and roll a little
          if (c.kind === 'mag') settleMag(c, g, fy);   // (a mag tips over onto its side, not snapped there)
          else if (FLAT_KINDS.has(c.kind)) settleFlat(c, g, fy);   // (and a board or a piece of grate eases down flat)
          else if (c.rest) { c.rest(g); g.position.y = fy + c.restY; } else { g.rotation.x = Math.PI / 2; g.rotation.z = 0; g.position.y = fy + c.r; }
          c.vx *= 0.6; c.vz *= 0.6;
        }
      }
    } else if (c.settle && c.settle.t < 1) {
      // tipping over onto its side (settleMag): eased round to the face it lies on and down onto the ground
      const S0 = c.settle; S0.t = Math.min(1, S0.t + dt / (S0.dur || MAG_SETTLE)); const k = smooth(S0.t);
      g.quaternion.slerpQuaternions(S0.q0, S0.q1, k); g.position.y = S0.y0 + (S0.y1 - S0.y0) * k;
      const nx = g.position.x + c.vx * dt, nz = g.position.z + c.vz * dt;
      if (!bulletBlocked(nx, nz)) { g.position.x = nx; g.position.z = nz; }
      const f = Math.exp(-dt * 5); c.vx *= f; c.vz *= f;
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
export const RACKS = {
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
export function cyclePose(c, q) {
  const o = { off: 0, lift: 0, grab: 0 }, B = c.v.beat, ex = c.v.ex;
  const run = (q0, q1, f) => f(clamp((q - q0) / (q1 - q0), 0, 1));
  if (!c.bolt) {
    if (c.q0 && q < B.fwd) { o.off = 1; return o; }                                                     // already back
    if (q < B.back) o.off = run(0, B.back, v => Math.pow(v, ex[0]));                                   // yanked back, quickest as it hits the stop
    else if (q < B.fwd) o.off = run(B.back, B.fwd, v => 1 - 0.08 * Math.sin(v * Math.PI) * (1 - v));   // a little bounce off it
    else if (q < B.home) o.off = run(B.fwd, B.home, v => 1 - Math.pow(v, ex[1]));                      // shoved forward, slamming home
    else o.off = run(B.home, 1, v => 0.05 * Math.sin(Math.min(1, v * 2.5) * Math.PI) * (1 - v));      // and a bounce off the front
    return o;
  }
  const q0 = c.q0 || 0;
  o.grab = smooth(clamp((q - q0) / B.reach, 0, 1)) * (1 - smooth(clamp((q - B.lock - 0.02) / (1 - B.lock - 0.02), 0, 1)));
  if (c.stop) o.grab *= 1 - smooth(clamp((q - B.back) / (c.stop - B.back), 0, 1));                     // pulled back to load: let go of it there
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
export const racked = id => EJECT[id] === 'pump' || EJECT[id] === 'bolt';
export const needsRack = id => racked(id) && !!W8.open[id];
const rackLast = {};
export function startCycle(id) {
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
// pulling the action back by hand before loading (the rifle's bolt every time, to feed it; a pump only when it's run
// dry): the first part of a rack, up to the rear stop, where the hand lets go and it's left open while the rounds go in
// (W8.held[id]: player/hold.js holds it back). It stays open till it's pushed home: at the end of the load, or, if the
// load's cut short (a vault, a sprint, putting the gun away), not till you pull the trigger (tickCycle), so a load
// picked up again carries on with it still open. No case to throw, the last one went with the shot. Returns how long it takes
export function openAction(id) {
  startCycle(id); const c = W8.cyc; c.done = true; c.stop = c.v.beat.fwd; W8.held[id] = true;
  return c.delay + c.dur * c.stop;
}
// racking a gun that's open to chamber a round, with no case to throw: after a load (an action held open while it was
// fed is only pushed forward, and a bolt locked), or when a rack was cut short. The rifle's detachable box has its bolt
// worked in D.detach seconds, the end of its reload (game/run-state.js: DETACH)
export function chamberCycle(id) {
  startCycle(id); const c = W8.cyc, B = c.v.beat; c.done = true; c.delay = 0.04;
  if (W8.held[id]) { c.q0 = c.bolt ? B.fwd - B.reach : B.fwd; c.t = c.delay + c.q0 * c.dur; while (c.beat < c.fx.length && c.fx[c.beat][0] < B.fwd) c.beat++; }
  else if (W(id).detach) { const f = W(id).detach / (c.dur + c.delay); c.dur *= f; c.delay *= f; }
}
// how long racking a loaded gun takes (chamberCycle) till the round's home and it'll fire, on average over its ways
// (the crosshair's reload ring counts it in: weapons/reload.js, relRingP)
export function chamberT(id) {
  const bolt = EJECT[id] === 'bolt', list = RACKS[bolt ? 'bolt' : 'pump'], r = W(id).rate / S.rateMul;
  return list.reduce((a, v) => {
    const k = Math.min(1, r / (v.dur + v.delay) * 0.92), B = v.beat, q0 = bolt && W8.boltOpen ? B.fwd - B.reach : 0;
    return a + (q0 ? 0 : 0.04) + (B.home - q0) * v.dur * k;
  }, 0) / list.length;
}
export function tickCycle(dt) {
  // (a pump's hand still coming onto the forend after a reload: it's worked once it's got hold, weapons/reload.js PUMP_GRAB)
  if (W8.grabT > 0) { if (curId() !== W8.grabId || W8.reloading) W8.grabT = 0; else { W8.grabT -= dt; if (W8.grabT > 0) return; W8.grabT = 0; if (W8.grabHeld && W8.held[W8.grabId] && (W8.mag[W8.grabId] || 0) > 0) { chamberCycle(W8.grabId); delete W8.held[W8.grabId]; } } }
  { const id = curId(); if (!W8.cyc && needsRack(id) && (W8.mag[id] || 0) > 0 && !W8.reloading && !swapSt && !(P.bandT > 0) && !P.vault && (!W8.held[id] || ((mouseDown || P.fireQ || (tStick.R && Math.hypot(tStick.R.x, tStick.R.y) > 0.4)) && !openSt))) { chamberCycle(id); delete W8.held[id]; } }   // (held open: only once you go to fire)
  const c = W8.cyc; if (!c) return;
  if (curId() !== c.id) { if (!c.done) ejectCasing(W(c.id).ammo, 1, EJECT[c.id]); W8.cyc = null; return; }
  if (P.vault) return;   // never worked mid-vault (your hands are on the sill or the rail): it waits where it is till you're over
  c.t += dt; const p = (c.t - c.delay) / c.dur, B = c.v.beat;
  // the case flies out as the action hits its rear stop
  if (!c.done && p >= B.back) { c.done = true; ejectCasing(W(c.id).ammo, 1, EJECT[c.id]); }
  while (c.beat < c.fx.length && p >= c.fx[c.beat][0]) c.fx[c.beat++][1]();
  if (c.stop && p >= c.stop) { W8.cyc = null; return; }   // pulled back to load (openAction): left there
  // home: a round's chambered, if there was one to feed
  if (!c.homed && p >= B.home) { c.homed = true; if ((W8.mag[c.id] || 0) > 0) W8.open[c.id] = false; }
  if (p >= 1) W8.cyc = null;
}
