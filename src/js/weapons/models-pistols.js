// The handguns' models: the 9mm (a Glock 17), the revolver and the Desert Eagle (gun-models.js puts every family
// together).

import { box } from '../core/geometry.js';
import { roundOn } from './rounds.js';
import { T, tierCtx } from '../game/run-state.js';
import { GM, X } from './gun-materials.js';
import {
  clipTo, cyl, glockRear, inset, irons, lathe, notchRear, portFill, profile, pullInside, ring, rrect, shp, solid, stipple, xsec,
  zAt
} from './gun-parts.js';
import { REV_CYL, REV_RAIL } from './gun-models.js';

export const PISTOL_MODELS = {
  // 9mm pistol: a Glock 17 Gen 5, traced off a side-on photo. The slide (serrations front and back, the sights, the
  // ejection port on the right with the barrel's hood in it) rides on a polymer frame: the dust cover with its rail
  // slot, the squared trigger guard with the safety-blade trigger, the slide stop, takedown lever and magazine
  // release, and the raked grip with its stippled panels. The magazine follows the tier: flush, a +5 base pad, a
  // 33-round stick, then a 50-round drum
  pistol(g, m) {
    const F = GM.poly, S2 = GM.glockS, mg = g.userData.magG || g, mt = T('mag');
    // ---- frame: dust cover and rail, the guard, the grip; the levers
    profile(g, shp([[0.839, 1.124], [0.727, 1.124], [0.727, 1.097], [0.741, 1.1], [0.79, 1.1], [0.798, 1.102], [0.82, 1.104], [0.833, 1.106], [0.839, 1.108]]), 0.028, F, X, 0.002);
    box(g, 0.022, 0.004, 0.006, GM.rubber, X, 1.1, 0.79);
    profile(g, shp([[0.732, 1.124], [0.655, 1.124], [0.655, 1.061], [0.668, 1.053], [0.73, 1.053], [0.732, 1.06]], [shp([[0.722, 1.098], [0.665, 1.098], [0.665, 1.066], [0.673, 1.061], [0.722, 1.061]])]), 0.026, F, X, 0.0015);
    // the grip, measured row by row: the beavertail's thin tang out under the slide, the web curving in beneath it,
    // the back strap and front strap raking back at 22 degrees, the rounded heel and the flared mag well
    const GB = [[0.5685, 1.102], [0.5665, 1.09], [0.5636, 1.0747], [0.561, 1.0669], [0.5577, 1.0592], [0.5551, 1.0514], [0.5513, 1.0437], [0.5467, 1.0359], [0.5429, 1.0281], [0.5377, 1.0204], [0.5331, 1.0126], [0.5293, 1.0048], [0.5254, 0.9971], [0.5228, 0.9893], [0.5215, 0.9815], [0.5204, 0.9738]];
    const GF = [[0.6393, 1.0514], [0.6354, 1.0437], [0.6328, 1.0359], [0.6295, 1.0281], [0.6263, 1.0204], [0.6231, 1.0126], [0.6198, 1.0048], [0.6173, 0.9971], [0.6134, 0.9893], [0.6108, 0.9815], [0.6082, 0.9738], [0.6071, 0.97]];
    profile(g, shp(inset([[0.657, 1.126], [0.541, 1.126], [0.534, 1.1238], [0.527, 1.1218], [0.5252, 1.1195], [0.5258, 1.1172], [0.529, 1.116], [0.538, 1.1152], [0.548, 1.1138], [0.556, 1.1115], [0.5625, 1.108], [0.567, 1.1045], ...GB,
      [0.5205, 0.9695], [0.5222, 0.9655], [0.5258, 0.9625], [0.531, 0.9605], [0.54, 0.9597], [0.602, 0.9597], [0.6055, 0.9615], [0.6068, 0.965], ...GF.slice().reverse(), [0.6412, 1.0565], [0.6455, 1.0605], [0.651, 1.0625], [0.657, 1.063]], 0.0025)), 0.028, F, X, 0.0025);
    // the stippled panels: the whole grip but a smooth band along the top and the flare at the bottom
    const pn = [[0.6435, 1.099]]; for (let k = 0; k <= 8; k++) { const yy = 1.052 - k * 0.0095; pn.push([zAt(GF, yy) - 0.0045, yy]); }
    for (let k = 0; k <= 8; k++) { const yy = 0.976 + k * 0.0154; pn.push([zAt(GB, yy) + 0.0045, yy]); }
    [-1, 1].forEach(sd => profile(g, shp(pn), 0.002, GM.glockT, X + sd * 0.0165, 0.0005));
    profile(g, shp([[0.691, 1.098], [0.6894, 1.0941], [0.6883, 1.0903], [0.6877, 1.0864], [0.6877, 1.0825], [0.6884, 1.0786], [0.6899, 1.0748], [0.692, 1.0709], [0.6946, 1.067], [0.6938, 1.0658], [0.691, 1.067], [0.6878, 1.0709], [0.6852, 1.0748], [0.6832, 1.0786], [0.6819, 1.0825], [0.6813, 1.0864], [0.6814, 1.0903], [0.682, 1.0941], [0.683, 1.098]]), 0.007, F, X, 0.0008);   // the trigger, back in the guard, curving forward
    box(g, 0.004, 0.006, 0.01, F, X, 1.09, 0.6865);   // its safety blade
    box(g, 0.003, 0.006, 0.022, GM.metal2, X + 0.016, 1.122, 0.662); box(g, 0.003, 0.007, 0.012, GM.metal2, X + 0.016, 1.112, 0.734); box(g, 0.004, 0.012, 0.012, F, X + 0.016, 1.085, 0.645);
    // ---- the barrel and chamber under the slide, the recoil guide in the dust cover
    cyl(g, 0.0105, 0.29, GM.metal2, X, 1.142, 0.695, 14); box(g, 0.022, 0.018, 0.06, GM.metal2, X, 1.142, 0.575); cyl(g, 0.006, 0.25, GM.metal2, X, 1.115, 0.72, 10);
    // ---- the slide (rides back on each shot, locks open on an empty mag)
    const sl = new THREE.Group(); g.add(sl);
    profile(sl, shp([[0.542, 1.1245], [0.842, 1.1245], [0.845, 1.137], [0.845, 1.146], [0.841, 1.157], [0.836, 1.16], [0.548, 1.161], [0.542, 1.158]], [rrect(0.687, 1.133, 0.757, 1.155, 0.003)]), 0.028, S2, X, 0.0025);
    portFill(sl, 0.687, 1.133, 0.757, 1.155, 0.028, 0.0025, S2);
    box(sl, 0.006, 0.014, 0.066, GM.metal2, X - 0.009, 1.146, 0.72);   // the barrel's hood in the port
    [-1, 1].forEach(sd => { for (let k = 0; k < 7; k++) box(sl, 0.002, 0.026, 0.003, GM.rubber, X + sd * 0.0166, 1.142, 0.549 + k * 0.0075); for (let k = 0; k < 5; k++) box(sl, 0.002, 0.026, 0.003, GM.rubber, X + sd * 0.0166, 1.142, 0.788 + k * 0.0075); });
    // the Glock's own sights: a slim front post, its back face upright and its front sloped, a round white dot on its
    // back; the rear a block narrower at its top than its base, its square notch outlined by a white U, the dot sitting
    // in the U as you line them up
    profile(sl, shp([[0.825, 1.1605], [0.834, 1.1605], [0.834, 1.162], [0.8295, 1.169], [0.825, 1.169]]), 0.003, GM.rubber, X);
    cyl(sl, 0.00125, 0.0008, GM.dot, X, 1.1665, 0.8248, 12);
    glockRear(sl, X, 1.169, 0.555, 0.019, 0.0145, 0.0075, 0.009, 0.0042, 0.0034, GM.rubber, GM.dot);
    irons(g, { kind: 'notch', yr: 1.169, rz: 0.555, yf: 1.169, fz: 0.829 });
    cyl(sl, 0.0065, 0.002, GM.rubber, X, 1.142, 0.8455, 12);
    // ---- the magazine, lying back at the grip's rake (it drops out along it): the body up inside the grip, then the
    // tier's base under the mag well: flush, a +5 base pad, a 33-round stick, a 50-round drum on its neck
    const t = 0.38, sn = Math.sin(t), cs = Math.cos(t), dn = (z, y, d) => [z - sn * d, y - cs * d];
    box(mg, 0.022, 0.13, 0.05, GM.metal2, X, 1.03, 0.587).rotation.x = t;
    const base = (f, b, y) => profile(mg, shp(inset([[b + 0.002, y], [f - 0.001, y], [f + 0.0015, y - 0.007], [f - 0.002, y - 0.0145], [f - 0.007, y - 0.016], [b + 0.003, y - 0.016], [b - 0.0015, y - 0.0128], [b - 0.0028, y - 0.0065]], 0.002)), 0.03, F, X, 0.002);
    if (mt === 0) base(0.6045, 0.5365, 0.9605);
    else if (mt === 1) profile(mg, shp(inset([[0.5385, 0.9605], [0.6045, 0.9605], [0.6058, 0.952], [0.598, 0.93], [0.596, 0.9255], [0.591, 0.9225], [0.534, 0.9225], [0.5292, 0.9258], [0.5285, 0.931], [0.5355, 0.952]], 0.002)), 0.032, F, X, 0.002);   // a +5 base pad
    else if (mt === 2) {   // a 33-round stick, nearly as long again as the grip, its base plate at the bottom
      const L = 0.178, [f1, y1] = dn(0.599, 0.962, L), [b1] = dn(0.544, 0.962, L);
      profile(mg, shp(inset([[0.544, 0.962], [0.599, 0.962], [f1, y1], [b1, y1]], 0.0015)), 0.023, F, X, 0.0015);
      [-1, 1].forEach(sd => profile(mg, shp([[0.549, 0.955], [0.553, 0.955], [b1 + 0.009, y1 + 0.012], [b1 + 0.005, y1 + 0.012]]), 0.001, GM.glockT, X + sd * 0.013, 0.0003));   // the seam down its back
      base(f1 + 0.004, b1 - 0.002, y1 + 0.001);
    } else {   // a 50-round drum: a neck down out of the grip into a drum lying along the gun, its winding key at the back
      const [nf, ny] = dn(0.597, 0.962, 0.05), [nb] = dn(0.548, 0.962, 0.05), r = 0.08, [cz] = dn(0.5725, 0.962, 0.07), cy = ny - 0.02 - r * 0.8;
      profile(mg, shp(inset([[0.548, 0.962], [0.597, 0.962], [nf, ny - 0.02], [nb, ny - 0.02]], 0.0015)), 0.026, F, X, 0.0015);
      lathe(mg, [[0.001, -0.036], [r - 0.012, -0.036], [r - 0.004, -0.033], [r, -0.026], [r, 0.026], [r - 0.004, 0.033], [r - 0.012, 0.036], [0.001, 0.036]].map(([rr, zz]) => [rr, cz + zz]), F, X, cy, 36);
      ring(mg, r + 0.0015, 0.006, GM.glockT, X, cy, cz + 0.012); ring(mg, r + 0.0015, 0.006, GM.glockT, X, cy, cz - 0.012);   // the seams round its rim
      cyl(mg, 0.026, 0.008, GM.glockT, X, cy, cz - 0.038, 20); box(mg, 0.034, 0.008, 0.006, GM.rubber, X, cy, cz - 0.044);   // the winding key
    }
    let front = 0.845;
    if (m.match) { const e = 0.04 * (m.match - 1); cyl(g, 0.0125, 0.11 + e, GM.metal2, X, 1.142, 0.9 + e / 2); ring(g, 0.0145, 0.012, GM.steel, X, 1.142, 0.95 + e); front = 0.955 + e; }   // a longer barrel with each level
    if (m.auto) box(sl, 0.006, 0.012, 0.04, GM.orange, X + 0.017, 1.135, 0.56);   // the auto sear's selector
    if (m.burst) { box(sl, 0.03, 0.03, 0.016, GM.metal2, X, 1.142, 0.536); box(sl, 0.01, 0.016, 0.02, GM.orange, X + 0.016, 1.15, 0.53).rotation.y = 0.35; }
    return { front, y: 1.142, magZ: 0.567, magY: 1.05, slide: sl, travel: 0.07, lock: true, top: 1.161, sz: 0.6, ownMags: true, laser: { y: 1.1, z: 0.786 } };   // the laser on the dust cover's rail
  },
  // .357 revolver: a stainless Smith & Wesson, measured off side-on photos (a 6" 617 for the frame, a snub-nosed 986
  // for the grips). The frame has a real window for the cylinder (so it's empty when the cylinder swings out), a thin
  // top strap with the rear sight, the hammer's checkered spur behind it, the trigger guard loop with a wide smooth
  // trigger; the fluted cylinder rides a crane hinged at its lower left and swings out to the left like a real one; the
  // barrel is a round tube with a rib and a full underlug, a ramped front sight with its red insert, longer with each
  // level (snub, 4", 6", 8 3/8"); the grips are finger-grooved wood with the medallion. Any optic goes on a picatinny
  // rail screwed down the top strap and on along the barrel's rib, in place of the rear sight (a Weigand-style mount)
  revolver(g, m) {
    const S2 = GM.stainless, D = GM.stainlessD, cy0 = REV_CYL.y, cr = REV_CYL.r, optic = T('sight') > 0;
    // ---- frame: grip frame, recoil shield, the window round the cylinder, the yoke's seat, the trigger guard
    profile(g, shp([[0.53, 1.118], [0.514, 1.134], [0.515, 1.158], [0.54, 1.155], [0.552, 1.165], [0.562, 1.174], [0.672, 1.174], [0.672, 1.125], [0.666, 1.115], [0.664, 1.088], [0.64, 1.087], [0.636, 1.081], [0.632, 1.062], [0.622, 1.048], [0.606, 1.042], [0.583, 1.04], [0.571, 1.043], [0.566, 1.061], [0.552, 1.061], [0.545, 1.064]],
      [rrect(0.577, 1.114, 0.662, 1.167, 0.004), shp([[0.628, 1.078], [0.624, 1.062], [0.614, 1.052], [0.598, 1.048], [0.584, 1.049], [0.577, 1.056], [0.577, 1.08]])]), 0.03, S2, X, 0.0025);
    box(g, 0.024, 0.05, 0.08, GM.rubber, X, 1.141, 0.62);   // the frame's inner wall behind the cylinder, so the window isn't see-through
    if (!optic) notchRear(g, X, 1.182, 0.558, 0.016, 0.009, 0.012, 0.0048, 0.0042, GM.rubber);   // the rear sight, a plain black notch
    [[0.548, 1.1], [0.556, 1.075]].forEach(([z, yy]) => cyl(g, 0.0035, 0.033, D, X, yy, z, 10).rotation.set(0, 0, Math.PI / 2));   // side plate screws
    box(g, 0.004, 0.008, 0.016, D, X + 0.016, 1.15, 0.566);   // the cylinder release, on the left
    profile(g, shp([[0.535, 1.135], [0.548, 1.162], [0.54, 1.168], [0.522, 1.166], [0.512, 1.162], [0.52, 1.156], [0.532, 1.152]]), 0.009, m.fan ? GM.brass : GM.steelDk, X, 0.001);   // hammer
    profile(g, shp([[0.605, 1.1], [0.598, 1.084], [0.599, 1.066], [0.607, 1.054], [0.597, 1.056], [0.587, 1.072], [0.585, 1.094], [0.594, 1.113], [0.609, 1.113]]), 0.01, GM.steel, X, 0.0012);   // the wide smooth trigger
    // ---- the grips, traced off the photo: black rubber up over the back strap to just under the hammer, a finger
    // groove down the front, pebbled sides inside a smooth border, the medallion and the screw; steel shows above the
    // rubber's top edge
    profile(g, shp([[0.4951, 1.1259], [0.5009, 1.1286], [0.511, 1.1291], [0.5145, 1.128], [0.5167, 1.1258], [0.5216, 1.1117], [0.5254, 1.1063], [0.5324, 1.1007], [0.5465, 1.0935], [0.5522, 1.0898], [0.5572, 1.0838], [0.5605, 1.0752], [0.5655, 1.061], [0.571, 1.061], [0.571, 1.12], [0.53, 1.138], [0.512, 1.138]]), 0.026, S2, X, 0.002);
    const RG = [[0.5605, 1.0752], [0.5572, 1.0838], [0.5522, 1.0898], [0.5465, 1.0935], [0.5324, 1.1007], [0.5254, 1.1063], [0.5216, 1.1117], [0.5167, 1.1258], [0.5145, 1.128], [0.511, 1.1291], [0.5009, 1.1286], [0.4951, 1.1259], [0.4926, 1.1232], [0.4905, 1.1116], [0.4881, 1.104], [0.4851, 1.0973], [0.4793, 1.0881], [0.4748, 1.0837], [0.4703, 1.0765], [0.4655, 1.0703], [0.4618, 1.0635], [0.4579, 1.0565], [0.4555, 1.0485], [0.4534, 1.0447], [0.4503, 1.0333], [0.4493, 1.0236], [0.4471, 1.0151], [0.4452, 1.002], [0.4438, 0.9969], [0.4425, 0.9915], [0.4407, 0.9841], [0.4406, 0.9799], [0.4415, 0.9773], [0.4445, 0.9754], [0.4491, 0.9739], [0.4588, 0.9733], [0.4694, 0.9724], [0.4811, 0.9711], [0.4989, 0.9711], [0.5062, 0.972], [0.5078, 0.9734], [0.5088, 0.9758], [0.5092, 0.9866], [0.5112, 0.9911], [0.5164, 0.9991], [0.5174, 1.0025], [0.5168, 1.0088], [0.5155, 1.0096], [0.515, 1.0153], [0.5154, 1.0185], [0.5168, 1.0221], [0.5234, 1.0323], [0.5248, 1.0488], [0.5272, 1.0543], [0.5311, 1.0591], [0.5346, 1.0615], [0.539, 1.0631], [0.5427, 1.0648], [0.5469, 1.0641], [0.5517, 1.0617], [0.5605, 1.0575]];
    solid(g, RG, 0.038, GM.poly, X, 0.008);
    stipple(g, clipTo(inset(RG, 0.0095), [[0.42, 0.95], [0.6, 0.95], [0.6, 1.083], [0.42, 1.083]]), 0.019, 0.0026, GM.ano, GM.poly);
    [-1, 1].forEach(sd => { cyl(g, 0.0093, 0.0016, GM.ano, X + sd * 0.0197, 1.0113, 0.4777, 24).rotation.set(0, 0, Math.PI / 2); cyl(g, 0.0068, 0.002, GM.poly, X + sd * 0.0198, 1.0113, 0.4777, 24).rotation.set(0, 0, Math.PI / 2); });   // the medallions
    cyl(g, 0.0042, 0.0018, D, X + 0.0199, 1.037, 0.4777, 12).rotation.set(0, 0, Math.PI / 2);   // the grip screw
    // ---- the cylinder on its crane (weapons/reload.js swings it out): fluted, the chamber mouths at its back, the
    // ejector rod in front; the crane's arm
    const crane = new THREE.Group(); crane.position.set(X + 0.014, cy0 - 0.02, 0.62); g.add(crane);
    const cg = new THREE.Group(); cg.position.set(-0.014, 0.02, 0); crane.add(cg);
    cyl(cg, cr, 0.08, S2, 0, 0, 0, 24);
    for (let k = 0; k < 6; k++) { const a = (k + 0.5) * Math.PI / 3; const f = box(cg, 0.007, 0.004, 0.048, D, Math.cos(a) * (cr - 0.0005), Math.sin(a) * (cr - 0.0005), -0.004); f.rotation.z = a + Math.PI / 2; }   // the flutes
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; cyl(cg, 0.0052, 0.003, GM.rubber, Math.cos(a) * REV_CYL.ch, Math.sin(a) * REV_CYL.ch, -0.04, 10); }   // chamber mouths, seen when it swings out
    // and a round's case head in each chamber, its rim and primer: the ones loaded and the ones fired till they're
    // dumped (a fired one's primer struck and its brass smoked), the rest left empty (cylHeads, player/hold.js)
    cg.userData.heads = [0, 1, 2, 3, 4, 5].map(k => {
      const a = k * Math.PI / 3, h = new THREE.Group(); h.position.set(Math.cos(a) * REV_CYL.ch, Math.sin(a) * REV_CYL.ch, -0.0418); cg.add(h);
      const rim = cyl(h, 0.0057, 0.0012, GM.brass, 0, 0, 0, 12), pr = cyl(h, 0.0019, 0.0006, GM.steel, 0, 0, -0.0008, 8);
      h.userData.rim = rim; h.userData.primer = pr; return h;
    });
    cyl(cg, 0.0035, 0.07, GM.steel, 0, 0, 0.074, 10); cyl(cg, 0.005, 0.008, GM.steel, 0, 0, 0.11, 10);   // ejector rod and its knob
    box(crane, 0.008, 0.02, 0.012, S2, -0.006, 0.006, 0.042);   // the crane's arm
    // ---- barrel: tube, rib, full underlug round the ejector rod, the front sight, the bore
    const bl = [0.085, 0.14, 0.195, 0.255][m.longbarrel || 0], z1 = 0.672 + bl;
    cyl(g, 0.0172, bl, S2, X, 1.152, 0.672 + bl / 2, 24);
    box(g, 0.012, 0.005, bl, S2, X, 1.1705, 0.672 + bl / 2);
    profile(g, shp([[0.672, 1.14], [z1 - 0.004, 1.14], [z1, 1.135], [z1 - 0.003, 1.126], [0.672, 1.125]]), 0.024, S2, X, 0.002);
    profile(g, shp([[z1 - 0.034, 1.173], [z1 - 0.012, 1.182], [z1 - 0.006, 1.182], [z1 - 0.004, 1.173]]), 0.003, S2, X, 0.0004); box(g, 0.0034, 0.004, 0.004, GM.dotR, X, 1.179, z1 - 0.012);
    if (!optic) irons(g, { kind: 'notch', yr: 1.182, rz: 0.558, yf: 1.182, fz: z1 - 0.009 });
    cyl(g, 0.0062, 0.004, GM.rubber, X, 1.152, z1 + 0.0005, 14);
    // ---- the rail, with an optic: flat on the top strap, then on a base saddled over the barrel's top (the rib under it),
    // the picatinny section on that with its cross slots, the base's screw showing each side; it stops short of the front
    // sight. The scope that goes on it is a handgun scope, shorter and slimmer than a rifle's, its long eye relief
    // putting it forward over the cylinder and barrel, low in its rings (weapons/attachments.js)
    let top = 1.174;
    if (optic) {
      const r0 = REV_RAIL.z0, r1 = Math.min(REV_RAIL.z1, z1 - 0.042), b0 = 1.1725, RT = b0 + 0.0105;
      xsec(g, shp([[X - 0.011, 1.165], [X + 0.011, 1.165], [X + 0.013, 1.169], [X + 0.013, b0 + 0.0012], [X - 0.013, b0 + 0.0012], [X - 0.013, 1.169]]), 0.672, r1, GM.rail, 0.0006);   // its base saddled over the barrel
      xsec(g, shp([[X - 0.0125, b0], [X + 0.0125, b0], [X + 0.0168, b0 + 0.003], [X + 0.0168, b0 + 0.005], [X + 0.0148, RT], [X - 0.0148, RT], [X - 0.0168, b0 + 0.005], [X - 0.0168, b0 + 0.003]]), r0, r1, GM.rail, 0.0006);
      for (let z = r0 + 0.012; z < r1 - 0.008; z += 0.0172) box(g, 0.0338, 0.0034, 0.0065, GM.rubber, X, RT - 0.0015, z);   // the cross slots, flush with its top
      [-1, 1].forEach(sd => cyl(g, 0.0028, 0.003, GM.steelDk, X + sd * 0.0132, 1.168, (0.672 + r1) / 2, 10).rotation.set(0, 0, Math.PI / 2));   // the base's screw, through it each side
      top = RT;
    }
    return { front: z1, y: 1.152, top, sz: 0.62, crane, laser: { y: 1.125, z: z1 - 0.05 }, scopeH: 0.04, scopeK: 0.74, scopeR: 0.8, scopeZ: 0.652 };   // the laser clamped under the lug
  },
  // .50 hand cannon: a stainless Desert Eagle Mark XIX, traced off a side-on photo. A fixed barrel block (a slotted
  // rail along its top, chamfered shoulders, a long flute down each side), the slide behind it (slanted serrations, the
  // round safety levers, the rear sight), the frame's lip under the barrel with its takedown buttons and slide stop, a
  // squared trigger guard, the steel grip with a beavertail and black rubber panels, and the magazine's base
  deagle(g, m) {
    const S2 = GM.stainless, D = GM.stainlessD;
    // ---- barrel block, its rail, flutes, front sight
    profile(g, shp([[0.674, 1.126], [0.905, 1.126], [0.913, 1.149], [0.916, 1.161], [0.915, 1.176], [0.91, 1.183], [0.674, 1.183]]), 0.026, S2, X, 0.003);
    xsec(g, shp([[X - 0.0105, 1.181], [X + 0.0105, 1.181], [X + 0.0085, 1.1875], [X - 0.0085, 1.1875]]), 0.674, 0.908, S2, 0.0006);
    for (let k = 0; k < 9; k++) box(g, 0.022, 0.003, 0.005, D, X, 1.1865, 0.745 + k * 0.0165);
    [-1, 1].forEach(sd => { box(g, 0.0022, 0.011, 0.194, D, X + sd * 0.0156, 1.161, 0.776); box(g, 0.0016, 0.003, 0.226, D, X + sd * 0.0152, 1.177, 0.792); });
    box(g, 0.003, 0.011, 0.012, GM.rubber, X, 1.192, 0.901);
    cyl(g, 0.0062, 0.004, GM.rubber, X, 1.16, 0.9165, 14);
    // ---- frame: the lip under the barrel, takedown buttons, slide stop, the guard and trigger, the hammer
    box(g, 0.03, 0.008, 0.22, S2, X, 1.122, 0.782);
    [[0.708, 1.111], [0.705, 1.1235]].forEach(([z, yy]) => cyl(g, 0.0042, 0.034, D, X, yy, z, 12).rotation.set(0, 0, Math.PI / 2));
    cyl(g, 0.0053, 0.003, D, X + 0.0165, 1.0749, 0.6426, 16).rotation.set(0, 0, Math.PI / 2);   // the magazine release, on the left
    [-1, 1].forEach(sd => box(g, 0.0025, 0.006, 0.06, D, X + sd * 0.0168, 1.1155, 0.628));
    // the guard, traced: its rear sweeping round into the front strap, a flat bottom, the front leaning forward as it
    // rises to the frame; the broad curved trigger blade sweeping back almost to the loop's rear wall
    profile(g, shp(inset([[0.7238, 1.124], [0.643, 1.124], [0.643, 1.0622], [0.6496, 1.0643], [0.6561, 1.0647], [0.6648, 1.062], [0.6693, 1.0616], [0.7042, 1.0619], [0.7096, 1.0624], [0.7111, 1.0633], [0.7127, 1.0664], [0.7109, 1.0787], [0.7117, 1.0885], [0.7138, 1.0954], [0.7162, 1.1002], [0.7195, 1.1048], [0.7238, 1.1091]], 0.0015),
      [shp(inset([[0.6492, 1.108], [0.648, 1.0959], [0.6468, 1.0912], [0.6466, 1.0868], [0.6471, 1.0833], [0.6488, 1.0791], [0.6517, 1.0748], [0.6541, 1.0725], [0.6582, 1.07], [0.6636, 1.0686], [0.6761, 1.0682], [0.6983, 1.0684], [0.7022, 1.07], [0.7044, 1.0729], [0.7048, 1.0747], [0.7044, 1.0905], [0.7031, 1.0969], [0.7019, 1.0994], [0.6992, 1.1017], [0.6975, 1.1048], [0.691, 1.1085], [0.6847, 1.1097], [0.6726, 1.11]], -0.0015))]), 0.022, S2, X, 0.0015);
    profile(g, shp([[0.655, 1.112], [0.6726, 1.112], [0.6726, 1.1093], [0.6655, 1.1073], [0.6634, 1.1036], [0.6605, 1.0941], [0.6607, 1.088], [0.6627, 1.0793], [0.6672, 1.0717], [0.6657, 1.0687], [0.664, 1.0699], [0.658, 1.0729], [0.6553, 1.0754], [0.6522, 1.0795], [0.6501, 1.0843], [0.6493, 1.0878], [0.6492, 1.0955], [0.65, 1.105]]), 0.008, GM.steel, X, 0.0008);
    profile(g, shp([[0.534, 1.165], [0.54, 1.165], [0.541, 1.175], [0.532, 1.182], [0.529, 1.178]]), 0.012, D, X, 0.001);
    // ---- the grip, traced off the photo: a rounded steel core (the beavertail's tang out over the hand, the web curving
    // in under it, the back strap raking back, the straight front strap flaring at its foot), the thick rubber panels
    // proud on each side (their own traced outline, notched under the slide stop, steel showing round them), the
    // medallion and the screw; the magazine's base with its finger lip
    const GO = [[0.6462, 1.122], [0.536, 1.122], [0.5346, 1.1327], [0.533, 1.1302], [0.5293, 1.1272], [0.5169, 1.1258], [0.51, 1.1241], [0.5021, 1.1206], [0.4972, 1.1162], [0.4979, 1.1132], [0.4998, 1.1109], [0.5019, 1.1098], [0.5296, 1.1096], [0.5386, 1.1077], [0.5437, 1.1048], [0.5477, 1.1011], [0.5502, 1.0978], [0.5526, 1.0923], [0.5537, 1.0859], [0.5531, 1.0765], [0.5498, 1.0634], [0.5377, 1.0379], [0.5289, 1.0168], [0.5249, 1.002], [0.5221, 0.9829], [0.5218, 0.9764], [0.5238, 0.9725], [0.528, 0.9695], [0.548, 0.9665], [0.6, 0.9648], [0.627, 0.9643], [0.6321, 0.9657], [0.6292, 0.975], [0.6271, 0.9824], [0.6274, 0.989], [0.6401, 1.0548], [0.643, 1.0602], [0.6459, 1.0626], [0.6462, 1.122]];
    solid(g, GO, 0.032, S2, X, 0.004);
    const RO = clipTo([[0.5297, 0.9756], [0.6109, 0.976], [0.619, 1.0153], [0.6321, 1.0845], [0.6325, 1.11], [0.6015, 1.11], [0.594, 1.112], [0.5933, 1.1215], [0.5745, 1.1215], [0.5606, 1.0784], [0.5548, 1.0694], [0.5482, 1.0561], [0.5406, 1.0398], [0.5349, 1.0238], [0.5279, 1.0078], [0.5257, 0.9984], [0.5234, 0.9808], [0.5247, 0.9764]], [[0.4, 0.9], [0.7, 0.9], [0.7, 1.1215], [0.4, 1.1215]]);
    const RI = pullInside(RO, inset(GO, 0.0035)), RF = inset(RI, 0.0045);
    // the stippled fields: one above the smooth band that runs down across the panel through the medallion, one below
    stipple(g, pullInside([[0.6255, 1.065], [0.6255, 1.0995], [0.586, 1.1005], [0.575, 1.085], [0.565, 1.065], [0.556, 1.04], [0.553, 1.027]], RF), 0.0215, 0.0026, GM.poly, GM.rubber);
    stipple(g, pullInside([[0.6085, 0.985], [0.616, 1.02], [0.6225, 1.057], [0.548, 0.998], [0.5495, 0.987]], RF), 0.0215, 0.0026, GM.poly, GM.rubber);
    [-1, 1].forEach(sd => {
      solid(g, RI, 0.006, GM.rubber, X + sd * 0.0185, 0.0024);
      cyl(g, 0.0098, 0.0012, GM.poly, X + sd * 0.0218, 1.0475, 0.5866, 24).rotation.set(0, 0, Math.PI / 2); cyl(g, 0.0074, 0.0016, GM.rubber, X + sd * 0.0219, 1.0475, 0.5866, 24).rotation.set(0, 0, Math.PI / 2);   // the medallion
      cyl(g, 0.0032, 0.0016, D, X + sd * 0.0219, 1.0156, 0.5404, 12).rotation.set(0, 0, Math.PI / 2);   // the grip screw
    });
    { const mg = g.userData.magG || g; solid(mg, [[0.5491, 0.9636], [0.6196, 0.9639], [0.6201, 0.962], [0.6319, 0.9613], [0.6334, 0.9594], [0.6327, 0.9578], [0.6171, 0.9554], [0.5541, 0.9549], [0.5463, 0.9584], [0.5483, 0.9599]], 0.036, GM.poly, X, 0.0015); box(mg, 0.024, 0.15, 0.06, GM.metal2, X, 1.03, 0.578).rotation.x = 0.16; }
    // ---- the slide: it rides back on each shot and locks open on an empty mag (player/hold.js)
    const sl = new THREE.Group(); g.add(sl);
    profile(sl, shp([[0.536, 1.122], [0.672, 1.122], [0.672, 1.188], [0.6, 1.188], [0.564, 1.185], [0.553, 1.175], [0.548, 1.17], [0.536, 1.17]]), 0.03, S2, X, 0.003);
    for (let k = 0; k < 9; k++) [-1, 1].forEach(sd => { const sr = box(sl, 0.002, 0.044, 0.0035, D, X + sd * 0.0181, 1.152, 0.6 + k * 0.0072); sr.rotation.x = 0.26; });
    [-1, 1].forEach(sd => { cyl(sl, 0.0078, 0.003, D, X + sd * 0.0188, 1.171, 0.566, 18).rotation.set(0, 0, Math.PI / 2); cyl(sl, 0.0062, 0.004, GM.steel, X + sd * 0.0198, 1.171, 0.566, 18).rotation.set(0, 0, Math.PI / 2); const lv = box(sl, 0.003, 0.006, 0.026, GM.steel, X + sd * 0.0198, 1.167, 0.578); lv.rotation.x = 0.22; box(sl, 0.0032, 0.0028, 0.0028, GM.red, X + sd * 0.0198, 1.164, 0.561); });
    box(sl, 0.0185, 0.0035, 0.018, S2, X, 1.1877, 0.58); notchRear(sl, X, 1.1975, 0.576, 0.0185, 0.008, 0.012, 0.0055, 0.0045, GM.rubber);   // the rear sight on its base, its notch level with the front post (the base no wider than the sight and wholly under the blades: it stood up into the notch, a pale band right across the view down the sights)
    irons(g, { kind: 'notch', yr: 1.1975, rz: 0.576, yf: 1.1975, fz: 0.901 });
    // the bolt in the slide's mouth, seen when it runs back
    cyl(g, 0.012, 0.075, GM.steel, X, 1.16, 0.64, 14); box(g, 0.024, 0.03, 0.08, GM.rubber, X, 1.15, 0.636);
    let front = 0.916; if (m.comp) { const L = 0.1 + 0.03 * (m.comp - 1); profile(g, shp([[0.916, 1.128], [0.916 + L, 1.132], [0.916 + L, 1.166], [0.916, 1.168]]), 0.03, S2, X, 0.003); for (let k = 0; k < 2 + m.comp; k++) box(g, 0.026, 0.004, 0.012, GM.rubber, X, 1.1685, 0.935 + k * 0.025); front = 0.916 + L; }   // (its top and ports kept well under the sights, which used to look straight into them down the sights)   // longer, with another port, each level
    if (roundOn(tierCtx) === 'boom') box(g.userData.magG || g, 0.0366, 0.0035, 0.07, GM.red, X, 0.9595, 0.589);   // explosive tips: the mag's base plate painted with a red band
    // (a scope or an ACOG goes on the barrel's rail, optRail: the top of it, where on its slots (well back, toward you),
    // and the eye relief to hold it at, out in front of you but not at full stretch, so its picture fills more of the view; the handgun scope a short one, scopeK, slimmer, scopeR, low on its rings, scopeH)
    return { front, y: 1.16, magZ: 0.588, magY: 1.07, slide: sl, travel: 0.07, lock: true, top: 1.188, sz: 0.61, laser: { y: 1.118, z: 0.81 }, stickMags: true,   // the laser under the frame's lip
      optRail: { top: 1.1875, z: 0.745, relief: 0.14 }, scopeH: 0.038, scopeK: 0.74, scopeR: 0.8 };
  },
};
