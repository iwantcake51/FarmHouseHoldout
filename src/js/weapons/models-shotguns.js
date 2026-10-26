// The shotguns' models: the pump, the double barrel and the auto shotgun (gun-models.js puts every family together).

import { box } from '../core/geometry.js';
import { roundOn } from './rounds.js';
import { T, tierCtx } from '../game/run-state.js';
import { GM, X } from './gun-materials.js';
import {
  apPart, apPlate, checker, clipTo, cyl, inset, irons, portFill, profile, pw, ring, rrect, shp, solid, stipple, taperX, xsec
} from './gun-parts.js';
import { SHELL_MAT, shellMat } from './gun-models.js';
import { clamp } from '../core/math.js';

// a bolt seen through its ejection port (z0 to z1 along the gun, at x, y; w wide, h tall): what the reload and the
// shots move is the group (its z), and the steel in it is cut, as it's drawn, to the part still inside the port
function portBolt(g, x, y, z0, z1, w, h) {
  const b = new THREE.Group(), L = z1 - z0; b.position.set(x, y, (z0 + z1) / 2); g.add(b);
  const m = box(b, w, h, L, GM.steel, 0, 0, 0), rest = b.position.z;
  m.onBeforeRender = () => {
    const sh = clamp(rest - b.position.z, 0, L - 0.0005), l = L - sh;   // (how far it's run back; how much is left in the port)
    m.scale.z = l / L; m.position.z = (z0 + z0 + l) / 2 - b.position.z; m.updateMatrix(); m.matrixWorld.multiplyMatrices(b.matrixWorld, m.matrix);
  };
  return b;
}

// the pump's ghost ring (a Mossberg 500/590 kit's): the ring's middle (y), where it stands (z) and the front blade's
// (fz), its hole's radius (r) and the ring's own thickness (t); the ears either side of it (their inner faces ex from the
// middle, from z0 to z1 along the gun, their tops at top). The picatinny rail on the receiver ahead of it (from z0, or
// zs with an optic, the rear sight taken off: to z1; its foot at y, its top at top)
const GHOST = { y: 1.1785, z: 0.566, fz: 1.372, r: 0.0036, t: 0.0016, ex: 0.011, ez0: 0.556, ez1: 0.574, top: 1.1875 };
// the double barrel's beads (radius, m) and how far over the rib's top your eye looks down it at the breech
const DBL_SIGHT = { front: 0.0034, mid: 0.0021, eye: 0.0145 };
const PUMP_RAIL = { z0: 0.58, zs: 0.53, z1: 0.712, y: 1.1615, top: 1.1725 };
export const SHOTGUN_MODELS = {
  // pump shotgun: a Mossberg 500 Field, traced off a side-on photo. The receiver is a slab with its rear top rolled down
  // onto the tang (the safety button sits there) and the ejection port on the shooter's right, the bolt showing in it;
  // the barrel is long and slim with a vent rib, ghost ring sights on a rail, the magazine tube under it ends in its cap and swivel
  // stud; the wood forend (finger groove, checkering) rides the tube on its action bars; the stock has a Mossberg's
  // hooked pistol grip with checkering, and a rubber pad with its diamond grooves
  pump(g, m) {
    const W = GM.walnut, K = GM.metal, B = GM.blued;
    // ---- stock (traced: the comb, the hollow of the wrist sweeping down into the grip, the belly to the toe), the pad
    // and its spacer, the sling stud, the checkering along the wrist; the wrist slimmer than the butt
    const sg = new THREE.Group(); g.add(sg);
    const SO = [[0.1645, 1.0964], [0.2083, 1.1025], [0.3798, 1.1207], [0.3896, 1.1207], [0.4041, 1.117], [0.4186, 1.1176], [0.4251, 1.1195], [0.471, 1.1404], [0.4802, 1.144], [0.4832, 1.1437], [0.5, 1.1437], [0.506, 1.14], [0.506, 1.104], [0.4939, 1.103], [0.4899, 1.1002], [0.4761, 1.0958], [0.4623, 1.0899], [0.45, 1.0817], [0.4417, 1.074], [0.4334, 1.0633], [0.4256, 1.0469], [0.4203, 1.0367], [0.415, 1.0364], [0.3713, 1.0462], [0.3584, 1.0442], [0.2157, 0.9858], [0.1996, 0.9798], [0.168, 0.9674]];
    solid(sg, SO, 0.052, W, X, 0.01);
    solid(sg, [[0.1393, 1.0948], [0.136, 1.0898], [0.135, 1.0726], [0.139, 1.0022], [0.1388, 0.9625], [0.1395, 0.9587], [0.1418, 0.9571], [0.1655, 0.9665], [0.1625, 1.0962]], 0.054, GM.pad, X, 0.008);
    profile(sg, shp([[0.1625, 1.0962], [0.1655, 0.9665], [0.169, 0.968], [0.1662, 1.0966]]), 0.05, GM.rubber, X, 0.002);   // the spacer
    for (let r = 0; r < 8; r++) for (let c = 0; c < 2; c++) [-1, 1].forEach(sd => { const d = box(sg, 0.002, 0.008, 0.008, GM.rubber, X + sd * 0.027, 0.975 + r * 0.0145 + c * 0.007, 0.147 + c * 0.009); d.rotation.x = Math.PI / 4; });   // the pad's diamond grooves
    checker(sg, clipTo(inset(SO, 0.0115), [[0.378, 1.072], [0.40, 1.079], [0.44, 1.093], [0.465, 1.108], [0.477, 1.135], [0.46, 1.13], [0.43, 1.118], [0.40, 1.106], [0.384, 1.097]].reverse()), 0.026, 0.0034, 0.52);
    taperX(sg, pw([[0.3, 1], [0.42, 0.82], [0.48, 0.84], [0.5, 0.8]]));
    { const t = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.002, 6, 10), GM.metal2); t.rotation.y = Math.PI / 2; t.position.set(X, 0.98, 0.207); g.add(t); box(g, 0.006, 0.008, 0.01, GM.metal2, X, 0.987, 0.207); }
    // ---- receiver: the port on the right (a window through it, filled behind so it reads as a recess), the pins, the
    // safety on the tang
    profile(g, shp([[0.489, 1.146], [0.495, 1.151], [0.503, 1.157], [0.52, 1.161], [0.6, 1.163], [0.717, 1.163], [0.718, 1.106], [0.612, 1.105], [0.598, 1.101], [0.497, 1.103], [0.489, 1.101]], [rrect(0.617, 1.139, 0.694, 1.157, 0.003)]), 0.038, K, X, 0.003);
    portFill(g, 0.617, 1.139, 0.694, 1.157, 0.038, 0.003, K);
    box(g, 0.02, 0.012, 0.024, GM.metal2, X, 1.165, 0.518); box(g, 0.006, 0.004, 0.012, GM.orange, X, 1.172, 0.521);
    [[0.523, 1.13], [0.537, 1.15]].forEach(([z, yy]) => cyl(g, 0.0042, 0.046, GM.metal2, X, yy, z, 10).rotation.set(0, 0, Math.PI / 2));
    // ---- trigger guard (rounded at the back, square at the front) and the trigger
    profile(g, shp([[0.52, 1.104], [0.579, 1.104], [0.579, 1.066], [0.536, 1.066], [0.524, 1.074], [0.519, 1.088]], [shp([[0.527, 1.1], [0.572, 1.1], [0.572, 1.072], [0.538, 1.072], [0.53, 1.078], [0.526, 1.09]])]), 0.012, K, X, 0.0015);
    profile(g, shp([[0.548, 1.102], [0.5467, 1.0985], [0.5457, 1.095], [0.5452, 1.0915], [0.5453, 1.088], [0.5461, 1.0845], [0.5475, 1.081], [0.5495, 1.0775], [0.552, 1.074], [0.5513, 1.0728], [0.5488, 1.074], [0.5459, 1.0775], [0.5434, 1.081], [0.5415, 1.0845], [0.5403, 1.088], [0.5397, 1.0915], [0.5396, 1.095], [0.5401, 1.0985], [0.541, 1.102]]), 0.006, GM.metal2, X, 0.0008);
    // ---- barrel with its vent rib (a strip on posts); the collar where it meets the receiver
    cyl(g, 0.0125, 0.016, B, X, 1.15, 0.726, 18); cyl(g, 0.0095, 0.66, B, X, 1.15, 1.058, 18);
    box(g, 0.009, 0.0024, 0.655, B, X, 1.1635, 1.058);
    for (let z = 0.75; z < 1.38; z += 0.057) box(g, 0.004, 0.004, 0.026, B, X, 1.1605, z);
    // ---- the picatinny rail along the receiver's top (its cross slots flush with its top); and with no optic on it, the
    // ghost ring sights (traced off the kit's photos): at the back a long saddle on the receiver, two tall flat ears with
    // rounded tops guarding the thick ring on its stem, the windage slide under it and the screw that holds it all; at
    // the muzzle a ramp, serrated on its back against glare, the blade standing on it with a red fibre along its top. You
    // look through the ring from close up, so it's out of focus: a soft ring round the sharp blade. With an optic both
    // come off and the back of the receiver's left smooth, the rail running back to it
    const sight = T('sight'), RL = PUMP_RAIL, rz0 = sight ? RL.zs : RL.z0;
    xsec(g, shp([[X - 0.0125, RL.y], [X + 0.0125, RL.y], [X + 0.0168, RL.y + 0.003], [X + 0.0168, RL.y + 0.005], [X + 0.0148, RL.top], [X - 0.0148, RL.top], [X - 0.0168, RL.y + 0.005], [X - 0.0168, RL.y + 0.003]]), rz0, RL.z1, GM.rail, 0.0006);
    for (let z = rz0 + 0.008; z < RL.z1 - 0.005; z += 0.0172) box(g, 0.0338, 0.0034, 0.0065, GM.rubber, X, RL.top - 0.0015, z);
    if (!sight) {
      const G = GHOST, y = G.y, z = G.z, by = 1.1695;   // (by: the saddle's top)
      apPart(solid(g, [[0.521, 1.157], [0.582, 1.16], [0.582, by], [0.533, by], [0.524, 1.165]], 0.034, K, X, 0.0015));   // the saddle
      [-1, 1].forEach(sd => apPart(profile(g, shp([[G.ez0, by - 0.002], [G.ez1, by - 0.002], [G.ez1, G.top - 0.0045], [G.ez1 - 0.0013, G.top - 0.0013], [G.ez1 - 0.0045, G.top], [G.ez0 + 0.0045, G.top], [G.ez0 + 0.0013, G.top - 0.0013], [G.ez0, G.top - 0.0045]]), 0.003, K, X + sd * (G.ex + 0.0015), 0.0005)));   // its ears
      apPart(box(g, 0.01, 0.003, 0.01, K, X, by + 0.0012, z));                                          // the windage slide
      apPart(box(g, 0.0035, y - G.r - by - 0.002, 0.003, K, X, (y - G.r + by + 0.002) / 2, z));          // the ring's stem
      const rg = new THREE.Mesh(new THREE.TorusGeometry(G.r + G.t / 2, G.t / 2, 8, 28), K); rg.position.set(X, y, z); g.add(rg); apPart(rg);   // the ring
      { const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0016, 14), GM.metal2); sc.position.set(X, by + 0.0006, 0.536); g.add(sc); apPart(sc);
        apPart(box(g, 0.0075, 0.0008, 0.001, GM.rubber, X, by + 0.0014, 0.536)); }                        // its screw, slotted
      const fz = G.fz, rs = (1.17 - 1.1655) / 0.034;   // the ramp's rise along it
      profile(g, shp([[fz - 0.042, 1.1635], [fz + 0.006, 1.1635], [fz + 0.006, 1.17], [fz - 0.008, 1.17], [fz - 0.042, 1.1655]]), 0.011, B, X, 0.0008);   // the ramp
      for (let k = 0; k < 7; k++) { const zz = fz - 0.037 + k * 0.0044; box(g, 0.0112, 0.001, 0.0012, B, X, 1.1655 + (zz - fz + 0.042) * rs + 0.0011, zz).rotation.x = -Math.atan(rs); }   // its serrations
      profile(g, shp([[fz - 0.007, 1.1695], [fz + 0.005, 1.1695], [fz + 0.005, 1.1735], [fz - 0.002, y - 0.0018], [fz - 0.007, y - 0.0018]]), 0.0026, B, X);   // the blade
      box(g, 0.0032, 0.0022, 0.0064, GM.fiber, X, y - 0.0011, fz - 0.0046);                               // its fibre, its top level with the ring's middle
      irons(g, { kind: 'ap', yr: y, rz: z, r: G.r, yf: y, fz: fz - 0.0046 });   // (looked through the ring at the blade: game/view-cam.js)
    }
    // ---- magazine tube and its cap, the barrel's lug that clamps onto it, the swivel stud; with an extension, the tube
    // runs on toward the muzzle and a clamp holds it to the barrel
    const tEnd = [1.146, 1.25, 1.32, 1.385][T('mag')];   // (its magazine line: Tube extension, Long tube, Full-length tube)
    cyl(g, 0.0088, tEnd - 0.718, GM.metal, X, 1.1225, (tEnd + 0.718) / 2, 16);
    box(g, 0.012, 0.022, 0.03, B, X, 1.135, 1.13);
    cyl(g, 0.0102, 0.026, B, X, 1.1225, tEnd - 0.011, 16); cyl(g, 0.0036, 0.012, GM.metal2, X, 1.1225, tEnd + 0.004, 10);
    if (T('mag')) { ring(g, 0.0118, 0.004, GM.metal2, X, 1.1225, 1.146); box(g, 0.014, 0.034, 0.016, GM.metal2, X, 1.137, tEnd - 0.05); }
    // ---- the forend and its action bars ride together (the pump cycle slides this group, player/hold.js)
    const fe = new THREE.Group(); g.add(fe);
    const FE = [[0.8048, 1.0935], [0.797, 1.0955], [0.7967, 1.0985], [0.7992, 1.1018], [0.8012, 1.1245], [0.8048, 1.1383], [0.8071, 1.142], [0.8269, 1.1496], [0.864, 1.1504], [1.0052, 1.1496], [1.0225, 1.1487], [1.028, 1.1436], [1.0299, 1.125], [1.0294, 1.1069], [1.0286, 1.102], [1.026, 1.1], [0.93, 1.0968], [0.87, 1.095]];
    solid(fe, FE, 0.058, W, X, 0.01);
    [-1, 1].forEach(sd => box(fe, 0.002, 0.004, 0.17, GM.walnut2, X + sd * 0.0292, 1.117, 0.93));   // the flute
    checker(fe, clipTo(inset(FE, 0.0115), [[0.875, 1.0], [0.995, 1.0], [0.985, 1.119], [0.885, 1.119]]), 0.029, 0.0034, 0.52);
    [-1, 1].forEach(sd => box(fe, 0.003, 0.006, 0.12, GM.metal2, X + sd * 0.008, 1.134, 0.758));
    // ---- the bolt in the port, which runs back with the forend
    // (only what's in the port shows: run back, its front leaves the port open in front of it and the rest of it goes
    // back inside the receiver, rather than sliding back along the outside of it: portBolt)
    const bolt = portBolt(g, X - 0.0176, 1.148, 0.619, 0.693, 0.004, 0.017);
    // a side saddle of spare shells on the left of the receiver, longer with each magazine tier
    const sm = shellMat(tierCtx);   // in the colour of the shells loaded
    const n = Math.min(8, 4 + T('mag') * 2);
    box(g, 0.006, 0.05, 0.024 * n + 0.01, GM.poly, X + 0.025, 1.132, 0.51 + n * 0.012);
    for (let k = 0; k < n; k++) { const z = 0.522 + k * 0.024; cyl(g, 0.0105, 0.054, sm, X + 0.039, 1.14, z, 10).rotation.set(0, 0, 0); cyl(g, 0.0112, 0.014, GM.brass, X + 0.039, 1.106, z, 10).rotation.set(0, 0, 0); }   // stood upright in it
    return { front: 1.39, y: 1.15, slide: fe, bolts: [bolt], travel: 0.15, cyc: true, top: PUMP_RAIL.top, sz: 0.6 };
  },
  // double barrel: a side-by-side, traced off side-on photos: a hammerless sidelock (the lock plates with their
  // engraved border, the top lever and the safety on the tang, the action bar running forward under the barrels to the
  // rounded knuckle), blued barrels with a matted rib and a bead, a slim splinter forend, a long tang guard round the
  // double triggers and a walnut stock with a rounded grip knob and a pad. The sawn-off is a coach gun: short barrels,
  // a deep forend reaching nearly to the muzzle and a taped pistol grip. The barrels, rib, forend and extractor hang on
  // the hinge pin in their own group, so the gun really breaks open to be loaded (player/hold.js); the shells' brass
  // heads show in the chambers
  dbl(g, m) {
    const B = GM.blued, E = GM.engr, W = GM.walnut, bl = m.sawn ? 0.343 : 0.788, z0 = 0.612, z1 = z0 + bl;
    // ---- the action: lock plates and standing breech, the bar and knuckle, top lever and safety, guard and triggers
    profile(g, shp([[0.542, 1.133], [0.552, 1.136], [0.57, 1.137], [0.582, 1.141], [0.585, 1.152], [z0, 1.152], [z0, 1.12], [0.7, 1.12], [0.712, 1.112], [0.716, 1.1], [0.711, 1.088], [0.7, 1.082], [0.637, 1.08], [0.6, 1.08], [0.542, 1.082]]), 0.05, E, X, 0.004);
    [-1, 1].forEach(sd => { profile(g, shp([[0.548, 1.088], [0.606, 1.088], [0.606, 1.13], [0.578, 1.13], [0.548, 1.124]], [shp([[0.552, 1.092], [0.602, 1.092], [0.602, 1.126], [0.579, 1.126], [0.552, 1.121]])]), 0.002, GM.engrD, X + sd * 0.0285, 0.0005);
      cyl(g, 0.0055, 0.004, GM.engrD, X + sd * 0.029, 1.096, 0.705, 14).rotation.set(0, 0, Math.PI / 2); cyl(g, 0.003, 0.004, GM.steelDk, X + sd * 0.029, 1.11, 0.565, 10).rotation.set(0, 0, Math.PI / 2); });
    { const tg = new THREE.Group(); tg.position.set(X, 0, z0 - 0.006); g.add(tg); profile(tg, shp([[0.572 - z0 + 0.006, 1.151], [0.006, 1.151], [0.006, 1.159], [0.58 - z0 + 0.006, 1.161]]), 0.012, GM.steel, -0.004, 0.001); tg.rotation.y = -0.25; }   // top lever on its spindle, swung to the right
    box(g, 0.008, 0.004, 0.014, GM.steel, X, 1.138, 0.556);   // safety on the tang
    profile(g, shp([[0.536, 1.082], [0.648, 1.082], [0.632, 1.067], [0.61, 1.058], [0.586, 1.058], [0.565, 1.07], [0.55, 1.078], [0.536, 1.078]], [shp([[0.635, 1.078], [0.626, 1.069], [0.608, 1.063], [0.588, 1.063], [0.57, 1.073], [0.566, 1.078]])]), 0.01, GM.steelDk, X, 0.0012);
    [0.6, 0.582].forEach(z => profile(g, shp([[z + 0.003, 1.068], [z + 0.005, 1.059], [z - 0.001, 1.06], [z - 0.004, 1.069], [z, 1.08], [z + 0.007, 1.08]]), 0.006, m.both ? GM.brass : GM.steel, X, 0.0008));
    if (m.both) box(g, 0.004, 0.004, 0.024, GM.brass, X, 1.067, 0.596);   // the triggers linked to fire both
    // ---- the stock, or a sawn-off's taped pistol grip
    if (!m.sawn) {
      // traced off the photo: the straight comb, the wrist dipping then rising into the lock plates, the pistol grip
      // down to its cap, the long belly to the toe; slimmer through the wrist; checkering on the grip; the black pad
      const sg = new THREE.Group(); g.add(sg);
      const SO = [[0.188, 1.1035], [0.2823, 1.1113], [0.4461, 1.1259], [0.459, 1.1245], [0.4741, 1.116], [0.4835, 1.1162], [0.5318, 1.1285], [0.5521, 1.1373], [0.549, 1.084], [0.5429, 1.0817], [0.5248, 1.0717], [0.508, 1.058], [0.4818, 1.0211], [0.4718, 1.0186], [0.4482, 1.0274], [0.4384, 1.0344], [0.433, 1.0478], [0.3007, 0.9936], [0.2843, 0.9871], [0.2045, 0.9549]];
      solid(sg, SO, 0.054, W, X, 0.011);
      solid(sg, [[0.1639, 1.1033], [0.188, 1.1035], [0.2045, 0.9549], [0.1853, 0.9472], [0.1802, 0.9493], [0.176, 0.9546], [0.1695, 1.0052], [0.1552, 1.0851], [0.1562, 1.0956]], 0.056, GM.pad, X, 0.007);
      checker(sg, clipTo(inset(SO, 0.0125), [[0.452, 1.04], [0.478, 1.032], [0.51, 1.07], [0.538, 1.105], [0.536, 1.13], [0.49, 1.12], [0.46, 1.1]]), 0.027, 0.0034, 0.52);
      taperX(sg, pw([[0.3, 1], [0.44, 0.8], [0.5, 0.8], [0.548, 1.02]]));
    } else {
      solid(g, [[0.371, 1.04], [0.39, 1.07], [0.41, 1.09], [0.427, 1.101], [0.455, 1.114], [0.474, 1.12], [0.489, 1.13], [0.546, 1.134], [0.546, 1.084], [0.491, 1.066], [0.467, 1.066], [0.457, 1.06], [0.437, 1.044], [0.418, 1.018], [0.403, 1.015], [0.395, 1.018], [0.378, 1.028]], 0.05, W, X, 0.01);
      profile(g, shp([[0.369, 1.042], [0.39, 1.072], [0.402, 1.064], [0.392, 1.04], [0.382, 1.023], [0.375, 1.028]]), 0.05, GM.rubber, X, 0.004);   // tape round its end
    }
    // ---- the barrels and everything on them, hung on the hinge pin
    const brk = new THREE.Group(); brk.position.set(X, 1.096, 0.705); g.add(brk);
    const bx = (x, yy, z) => [x, yy - 1.096, z - 0.705];
    [-1, 1].forEach(sd => {
      cyl(brk, 0.0145, bl, B, ...bx(sd * 0.0155, 1.14, z0 + bl / 2), 18);
      cyl(brk, 0.0158, 0.05, B, ...bx(sd * 0.0155, 1.14, z0 + 0.025), 18);
      cyl(brk, 0.0105, 0.002, GM.rubber, ...bx(sd * 0.0155, 1.14, z1 + 0.0005), 14);
      cyl(brk, 0.0105, 0.002, GM.rubber, ...bx(sd * 0.0155, 1.14, z0 - 0.0005), 14);
    });
    box(brk, 0.012, 0.011, bl - 0.01, B, ...bx(0, 1.1535, z0 + bl / 2));   // the rib, sunk into the valley between them
    box(brk, 0.008, 0.006, bl - 0.02, B, ...bx(0, 1.124, z0 + bl / 2));
    // the sights: an ivory bead on the rib at the muzzle and a smaller one halfway along it, looked at down the rib from
    // a little above it (DBL_SIGHT.eye over the rib's top at the breech), the way a side-by-side is aimed: the rib a
    // narrow strip running out to the beads, the action and top lever well down out of the way, the front bead sitting
    // on the mid bead's shoulders
    { const D = DBL_SIGHT, top = 1.159, bead = (r, z) => { const bd = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), GM.dot); bd.position.set(...bx(0, top + r * 0.8, z)); brk.add(bd); };
      bead(D.front, z1 - 0.012); bead(D.mid, z0 + bl * 0.5);
      irons(g, { kind: 'bead', yr: top + D.eye, rz: z0 + 0.012, yf: top + D.front * 1.8, fz: z1 - 0.012 }); }   // (down the rib to the front bead's top)
    box(brk, 0.022, 0.024, 0.07, B, ...bx(0, 1.114, z0 + 0.04));   // the lumps, down into the bar
    box(brk, 0.012, 0.008, 0.004, GM.steel, ...bx(0, 1.152, z0 + 0.0015));   // extractor
    profile(brk, shp([[0.012, 0.024], [0.06, 0.028], [0.06, 0.006], [0.04, -0.006], [0.016, -0.012], [0.006, -0.006]]), 0.044, GM.engrD, 0, 0.002);   // forend iron
    if (!m.sawn) profile(brk, shp([[0.72, 1.12], [0.972, 1.126], [0.975, 1.119], [0.96, 1.112], [0.86, 1.11], [0.79, 1.104], [0.72, 1.1]].map(([z, yy]) => [z - 0.705, yy - 1.096])), 0.038, W, 0, 0.005);
    else profile(brk, shp([[0.72, 1.12], [0.939, 1.121], [0.934, 1.112], [0.92, 1.104], [0.85, 1.096], [0.78, 1.088], [0.72, 1.09]].map(([z, yy]) => [z - 0.705, yy - 1.096])), 0.046, W, 0, 0.006);
    // the brass heads of the shells in the chambers, shown while loaded
    const rims = [-1, 1].map(sd => cyl(brk, 0.0125, 0.003, GM.brass, ...bx(sd * 0.0155, 1.14, z0 - 0.0015), 16));
    return { front: z1, y: 1.14, top: 1.155, sz: 0.66, brk, rims };
  },
  // automatic shotgun: an AA-12, traced off a level side-on photo. One long slab is receiver and stock together (square
  // at the front round the barrel's shoulder with a cross pin through it, the textured panel and the latch on its left,
  // the ejection port on the right, the sling pin at the butt); the tall folding front sight, the A-frame rear sight
  // and the little fin of the charging handle on top (it's open bolt: the reload pulls the fin back); under it the
  // polymer grip with its thumb-hole curve and textured insert, the selector plate, the steel guard (a bar under the
  // trigger, a rod down the back of the mag well and a long bar back to the foot of the grip), the trigger, and the
  // drum in the mag well
  auto12(g, m) {
    const K = GM.metal, St = GM.steel, mg = g.userData.magG || g;
    // ---- the slab and the housing under it (trigger housing and mag well)
    const SL = [[1.1963, 1.1742], [1.1956, 1.1894], [1.1904, 1.1972], [0.13, 1.1985], [0.1122, 1.1932], [0.1062, 1.1908], [0.1021, 1.1871], [0.0994, 1.1811], [0.0972, 1.1679], [0.1021, 1.0197], [0.1043, 1.0126], [0.1084, 1.0081], [0.1138, 1.0062], [0.1239, 1.0058], [0.2587, 1.0365], [0.3542, 1.0578], [0.4078, 1.0687], [0.4333, 1.079], [0.4355, 1.0829], [0.6177, 1.091], [0.9693, 1.091], [1.0047, 1.0937], [1.0475, 1.0978], [1.1534, 1.1027], [1.1696, 1.1028], [1.1937, 1.1043], [1.1963, 1.1116]];
    solid(g, SL, 0.068, K, X, 0.012);
    solid(g, [[0.586, 1.097], [0.8101, 1.097], [0.8101, 1.0797], [0.7775, 1.0771], [0.6744, 1.0494], [0.6594, 1.0488], [0.586, 1.0461]], 0.05, K, X, 0.004);
    const panel = rrect(0.858, 1.118, 1.126, 1.166, 0.008).getPoints(4).map(p => [p.x, p.y]);
    stipple(g, panel, 0.034, 0.0034, GM.poly, GM.rubber);                                                                // the textured panels
    cyl(g, 0.005, 0.071, St, X, 1.151, 1.186, 12).rotation.set(0, 0, Math.PI / 2);                                          // the cross pin
    cyl(g, 0.0045, 0.071, St, X, 1.1235, 0.13, 12).rotation.set(0, 0, Math.PI / 2);                                         // the sling pin
    box(g, 0.004, 0.009, 0.04, St, X + 0.0345, 1.1425, 0.822); cyl(g, 0.004, 0.004, St, X + 0.0365, 1.1425, 0.84, 10).rotation.set(0, 0, Math.PI / 2);   // the latch
    // ---- barrel, its bore; the folding front sight, the tall rear sight
    cyl(g, 0.0163, 0.112, St, X, 1.13, 1.247, 18); cyl(g, 0.0095, 0.002, GM.rubber, X, 1.13, 1.3035, 12);
    // (with an optic on, both sights are folded down flat, as these fold, so nothing stands up in front of it: the
    // rear's tall plate laid back along the receiver behind the optic, the front post laid forward along the barrel)
    if (T('sight')) { box(g, 0.02, 0.007, 0.064, St, X, 1.1955, 0.5015); box(g, 0.012, 0.007, 0.088, St, X, 1.1955, 1.152); }
    else {
      profile(g, shp([[1.108, 1.192], [1.1995, 1.192], [1.1995, 1.275], [1.194, 1.29], [1.188, 1.29], [1.181, 1.277], [1.1747, 1.2537], [1.1685, 1.2305], [1.154, 1.2273], [1.1332, 1.2186], [1.1114, 1.2121]], [shp([[1.1785, 1.258], [1.191, 1.258], [1.191, 1.279], [1.1855, 1.279]])]), 0.012, St, X, 0.0012);
      const RS = [[0.4688, 1.192], [0.534, 1.192], [0.5339, 1.2393], [0.5331, 1.2939], [0.5302, 1.2989], [0.522, 1.3002], [0.5148, 1.3032], [0.5081, 1.2945], [0.4975, 1.2648], [0.4861, 1.2258], [0.4802, 1.206], [0.4688, 1.2051]];
      apPart(profile(g, shp(clipTo(RS, [[0.4, 1.15], [0.6, 1.15], [0.6, 1.284], [0.4, 1.284]]), [shp([[0.497, 1.215], [0.522, 1.215], [0.522, 1.255], [0.505, 1.255]])]), 0.02, St, X, 0.0012));
      apPlate(g, X, 0.01, 1.284, 1.3032, 0.5081, 0.5339, 1.29, 0.0028, St);   // the aperture plate across its top, the hole looked through down the gun
      irons(g, { kind: 'ap', yr: 1.29, rz: 0.52, r: 0.0028, yf: 1.29, fz: 1.191 });   // (the rear's aperture level with the front post's tip: game/view-cam.js)
    }
    // ---- the charging handle's fin on top: its own group so the reload can pull it back
    const ch = new THREE.Group(); g.add(ch);
    profile(ch, shp([[0.8152, 1.192], [0.8793, 1.192], [0.8793, 1.2026], [0.8709, 1.2034], [0.8628, 1.2072], [0.8584, 1.2114], [0.8565, 1.2156], [0.8553, 1.2222], [0.8591, 1.2344], [0.8574, 1.2379], [0.8555, 1.2382], [0.8452, 1.232], [0.8364, 1.2234], [0.8304, 1.2091], [0.8265, 1.2074], [0.8184, 1.2073], [0.8152, 1.2046]]), 0.008, St, X, 0.0012);
    // ---- the ejection port on the right with the bolt in it, running back on each shot and held open when empty
    profile(g, shp([[0.66, 1.127], [0.77, 1.127], [0.77, 1.165], [0.66, 1.165]]), 0.002, GM.rubber, X - 0.0345, 0.0004);
    const bc = box(g, 0.003, 0.03, 0.06, St, X - 0.0352, 1.146, 0.74); bc.userData.clip = 0.66;
    // ---- the grip (its textured insert), the selector, the steel guard, the trigger
    const GR = [[0.4313, 1.0828], [0.4551, 1.0844], [0.4621, 1.0841], [0.4785, 1.0799], [0.4866, 1.0747], [0.493, 1.068], [0.5021, 1.0531], [0.5053, 1.0427], [0.5059, 1.0321], [0.5021, 1.0189], [0.4959, 1.0063], [0.4848, 0.994], [0.4769, 0.9829], [0.4667, 0.9642], [0.4579, 0.9391], [0.4546, 0.915], [0.4559, 0.9092], [0.4605, 0.9031], [0.4693, 0.8985], [0.4791, 0.8883], [0.4883, 0.8862], [0.5084, 0.8874], [0.5221, 0.8845], [0.5266, 0.8858], [0.5314, 0.8904], [0.5238, 0.8998], [0.5224, 0.9084], [0.5283, 0.9327], [0.5383, 0.959], [0.5475, 0.9773], [0.5584, 0.9939], [0.5668, 1.0013], [0.5746, 1.0024], [0.5763, 1.0099], [0.5702, 1.0174], [0.5681, 1.0269], [0.5699, 1.0339], [0.5737, 1.0397], [0.5789, 1.0437], [0.588, 1.0461], [0.588, 1.095], [0.43, 1.095]];
    solid(g, GR, 0.044, K, X, 0.009);
    stipple(g, clipTo(inset(GR, 0.013), [[0.44, 0.905], [0.56, 0.905], [0.56, 1.008], [0.44, 1.008]]), 0.022, 0.003, GM.poly, GM.rubber);
    box(g, 0.002, 0.02, 0.04, St, X + 0.0225, 1.07, 0.557); { const lv = box(g, 0.003, 0.004, 0.022, St, X + 0.025, 1.068, 0.553); lv.rotation.x = -0.9; }   // the selector
    profile(g, shp([[0.4971, 0.886], [0.5242, 0.8791], [0.5391, 0.873], [0.5494, 0.8685], [0.5731, 0.8582], [0.5896, 0.854], [0.6647, 0.8467], [0.6715, 0.8474], [0.6754, 0.8497], [0.6779, 0.8547], [0.6715, 0.8545], [0.59, 0.861], [0.5735, 0.8652], [0.5498, 0.8755], [0.5395, 0.88], [0.5246, 0.8861], [0.4975, 0.893]]), 0.012, St, X, 0.0012);   // the long bar
    profile(g, shp([[0.6655, 0.8475], [0.6779, 0.8475], [0.6921, 0.8637], [0.6872, 0.9018], [0.6768, 1.0155], [0.6742, 1.0502], [0.6667, 1.0502], [0.6693, 1.0155], [0.6797, 0.9018], [0.684, 0.866], [0.6735, 0.8545]]), 0.01, St, X, 0.0012);   // the rod
    profile(g, shp([[0.574, 1.0045], [0.6697, 1.0075], [0.6697, 1.0145], [0.574, 1.0115]]), 0.01, St, X, 0.001);   // the bar under the trigger
    profile(g, shp([[0.605, 1.04], [0.601, 1.03], [0.603, 1.016], [0.596, 1.022], [0.593, 1.035], [0.598, 1.047], [0.607, 1.047]]), 0.007, St, X, 0.0008);   // the trigger
    // ---- the magazine (in the mag group, so the reload can drop it): its own 8-shell box, raked a little forward with
    // ribs down its sides and a base plate; or, with its one magazine upgrade, the drum: face forward, a hub in the
    // middle, the chrome band round its back edge (a stripe on either in the colour of the shells loaded, if they aren't buckshot)
    const dy = 0.956, dz = 0.735, dr = 0.114;
    if (T('mag')) {
      cyl(mg, dr, 0.078, K, X, dy, dz, 40); cyl(mg, dr + 0.0015, 0.008, St, X, dy, dz - 0.035, 40);
      cyl(mg, 0.02, 0.004, GM.rubber, X, dy, dz + 0.0405, 20); cyl(mg, 0.006, 0.004, GM.metal2, X, dy - dr + 0.016, dz + 0.0405, 10);
      if (SHELL_MAT[roundOn(tierCtx)]) cyl(mg, dr + 0.002, 0.012, SHELL_MAT[roundOn(tierCtx)], X, dy, dz + 0.016, 40);
    } else {
      const bm = new THREE.Group(); bm.position.set(X, 1.075, dz); bm.rotation.x = -0.08; mg.add(bm);
      box(bm, 0.05, 0.215, 0.095, K, 0, -0.1075, 0); box(bm, 0.056, 0.016, 0.103, GM.poly, 0, -0.218, 0.002);
      [-1, 1].forEach(sd => { box(bm, 0.003, 0.16, 0.012, GM.metal2, sd * 0.026, -0.105, 0.022); box(bm, 0.003, 0.16, 0.012, GM.metal2, sd * 0.026, -0.105, -0.022); });
      if (SHELL_MAT[roundOn(tierCtx)]) box(bm, 0.052, 0.014, 0.097, SHELL_MAT[roundOn(tierCtx)], 0, -0.17, 0);
    }
    return { front: 1.3025, y: 1.13, slide: bc, bolts: [], travel: 0.115, lock: true, mz: dz, magY: 1.05, top: 1.1985, sz: 0.62, laser: { y: 1.105, z: 1.1 }, charge: ch, chargeAt: [X, 1.215, 0.85], chargeTravel: 0.1 };
  },
};
