// The submachine guns' models: the SMG, and the MP5 (sub) with its own parts: front, rear, drum, the 10mm conversion's
// mag (gun-models.js puts every family together).

import { V3 } from '../core/renderer.js';
import { clamp } from '../core/math.js';
import { box } from '../core/geometry.js';
import { hasMod, T, tierCtx } from '../game/run-state.js';
import { heatAll } from '../effects/supp-heat.js';
import { GM, X } from './gun-materials.js';
import {
  apPart, cyl, inset, irons, knurl, lathe, profile, pw, ribTube, ring, rrect, shp, solid, taperX, xsec, zAt
} from './gun-parts.js';

// the MP5's 50-round drum: a short collar up into the well and the round drum hung right up under it facing forward, as drums do (its round faces to the front and back, along the barrel): its two shells
// meeting at a raised seam, a hub on each face and the winding key on the front one
function mp5Drum(mg, K) {
  solid(mg, [[0.7225, 1.0578], [0.7879, 1.0573], [0.7887, 1.0528], [0.7859, 1.0474], [0.787, 1.0], [0.724, 1.0], [0.7271, 1.0286]], 0.026, K, X, 0.004);   // the short collar up into the well
  const R = 0.082, D = 0.1, cz = 0.755, cy = 1.03 - R;   // (its top right up under the well, centred under it, its axis along the gun)
  const along = m => { m.rotation.set(Math.PI / 2, 0, 0); return m; };
  along(cyl(mg, R, D, K, X, cy, cz, 28));                                                        // the drum
  along(cyl(mg, R + 0.003, 0.012, GM.metal2, X, cy, cz, 28));                                    // the seam between its shells
  [-1, 1].forEach(s => {
    along(cyl(mg, R * 0.72, 0.004, GM.metal2, X, cy, cz + s * (D / 2 + 0.001), 24));             // the pressed face
    along(cyl(mg, 0.019, 0.012, GM.metal2, X, cy, cz + s * (D / 2 + 0.005), 14));                // the hub
  });
  const key = box(mg, 0.05, 0.012, 0.006, GM.steel, X, cy, cz + D / 2 + 0.013); key.rotation.z = 0.6;   // the winding key, on the front
}
// the MP5 (sub, below), built round on the lines traced off its side photo: the barrel's axis (ax), the cocking tube's
// axis and radius (ct), the receiver's half width, top and bottom (rw, top, bot) and where it ends at the front
// (rcvEnd), where the front sight block starts (fs), the muzzle, where the cocking handle rests, and how far back the
// SD's front sight sits (sdShift)
const MP5 = { ax: 1.119, ct: { y: 1.159, r: 0.0125 }, rw: 0.022, top: 1.1745, bot: 1.1116, rcvEnd: 0.7985, fs: 1.0365, muzzle: 1.1225, handle: 0.945, sdShift: -0.0542 };
// the A2 stock's width down the gun, as a share of its full width: full at the butt, slimmer through the wrist, full again
// where it takes the receiver
const STK_W = pw([[0.2, 1], [0.34, 0.84], [0.43, 0.84], [0.49, 1]]);
// its front sight block, dz further along (the SD's sits further back and has no barrel out front): round the front of
// the cocking tube a collar with the tube's knurled end cap on it; up off it on a neck the hooded ring, the post inside;
// under it, round the barrel, the clamp with its bolt and the sling loop on the left; out ahead the barrel's collar with
// its three lugs and the knurled thread protector, open at the bore
function mp5Front(g, dz, barrel) {
  const K = GM.metal, ct = MP5.ct, z = v => v + dz;
  cyl(g, 0.0152, 0.03, K, X, ct.y, z(1.0545), 24);                                                         // the collar round the tube
  lathe(g, [[0, z(1.0695)], [0.018, z(1.0695)], [0.019, z(1.0703)], [0.019, z(1.0722)], [0.0176, z(1.0734)], [0.009, z(1.0739)], [0, z(1.0739)]], K, X, ct.y, 28);   // the end cap
  ribTube(g, 0.0192, 0.0026, K, X, ct.y, z(1.0712), 20, 0.0007);                                           // its knurled rim
  const hy = 1.2144 - 0.021;   // (its top where the photo has it)
  box(g, 0.012, hy - 0.019 - ct.y, 0.02, K, X, (hy - 0.019 + ct.y) / 2 + 0.006, z(1.0555));              // the hood's neck
  lathe(g, [[0.014, z(1.0458)], [0.019, z(1.0448)], [0.021, z(1.0468)], [0.021, z(1.0642)], [0.019, z(1.0662)], [0.014, z(1.0652)], [0.014, z(1.0458)]], K, X, hy, 28);   // the hooded ring
  box(g, 0.0022, 0.013, 0.004, K, X, hy - 0.0072, z(1.0555));                                             // the post in it
  irons(g, { yf: hy - 0.0007, fz: z(1.0555) });
  if (!barrel) return;
  const ax = MP5.ax;
  cyl(g, 0.0166, 0.033, K, X, ax, z(1.0532), 24);                                                          // the barrel clamp
  box(g, 0.02, ct.y - ax, 0.026, K, X, (ct.y + ax) / 2, z(1.0545));                                        // the web joining it to the collar
  cyl(g, 0.0046, 0.006, GM.metal2, X + 0.0172, ax, z(1.0535), 6).rotation.set(0, 0, Math.PI / 2);         // the clamp bolt's head, on the left
  { const t = new THREE.Mesh(new THREE.TorusGeometry(0.0072, 0.0015, 6, 16), GM.metal2); t.position.set(X + 0.0185, ax - 0.0115, z(1.043)); t.rotation.y = Math.PI / 2; t.castShadow = true; g.add(t); }   // the sling loop
  lathe(g, [[0, z(1.0695)], [0.0113, z(1.0695)], [0.0113, z(1.0912)], [0, z(1.0912)]], K, X, ax, 24);      // the lug collar
  [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 - 2.094].forEach(a => { const b = box(g, 0.006, 0.006, 0.013, K, X + Math.cos(a) * 0.0122, ax + Math.sin(a) * 0.0122, z(1.0805)); b.rotation.z = a - Math.PI / 2; });   // its three lugs
  lathe(g, [[0, z(1.0912)], [0.0106, z(1.0912)], [0.0106, z(1.1193)], [0.0093, z(1.1225)], [0, z(1.1225)]], K, X, ax, 24);   // the thread protector
  ribTube(g, 0.0107, 0.018, K, X, ax, z(1.103), 16, 0.0007);                                               // its knurling
  cyl(g, 0.0052, 0.002, GM.rubber, X, ax, z(1.1228), 12);                                                  // the bore
}
// its cocking handle at z: a short stem out of the slot on the tube's left side, pointing out and a little up and
// forward, and the knob on it, a knurled mushroom with a domed face
const _mpD = new V3(0.85, 0.45, 0.2).normalize(), _mpQ = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), _mpD);
function mp5Handle(g, z) {
  const ct = MP5.ct, rl = Math.hypot(_mpD.x, _mpD.y), h = new THREE.Group(); g.add(h);
  h.position.set(X + ct.r * _mpD.x / rl * 0.9, ct.y + ct.r * _mpD.y / rl * 0.9, z); h.quaternion.copy(_mpQ);
  cyl(h, 0.0034, 0.009, GM.steel, 0, 0, 0.0035, 12);                                                       // the stem
  ribTube(h, 0.0128, 0.0062, GM.metal, 0, 0, 0.0108, 18, 0.0009);                                          // the knob's knurled rim
  lathe(h, [[0, 0.0139], [0.0085, 0.0164], [0.0122, 0.0139], [0.0128, 0.0139], [0.0128, 0.0077], [0.007, 0.0068], [0, 0.0068]], GM.metal, 0, 0, 22);   // and its domed face
}
// the receiver's section: flat sides under a round top, the bottom corners taken off, and pressed into the left side
// (L) and the right (Rt) the long channel under the round, the rolled lip under it standing out ([out from the side,
// y] from the bottom up)
const MP5_CH = [[0, 1.1222], [0.0009, 1.1232], [0.0013, 1.1252], [0.0009, 1.1272], [-0.001, 1.1284], [-0.0042, 1.1296], [-0.005, 1.1318], [-0.005, 1.1462], [-0.004, 1.149], [-0.0012, 1.15]];
function mp5Section(L, Rt) {
  const R = MP5.rw, yc = MP5.top - R, b = MP5.bot, c = 0.0015, sh = new THREE.Shape();
  sh.moveTo(X - R + c, b); sh.lineTo(X + R - c, b); sh.lineTo(X + R, b + c);
  if (L) MP5_CH.forEach(([d, y]) => sh.lineTo(X + R + d, y));
  for (let i = 0; i <= 16; i++) { const a = Math.PI * i / 16; sh.lineTo(X + R * Math.cos(a), yc + R * Math.sin(a)); }
  if (Rt) MP5_CH.slice().reverse().forEach(([d, y]) => sh.lineTo(X - R - d, y));
  sh.lineTo(X - R, b + c); sh.closePath(); return sh;
}
// its rear sight: a plate clamped down on the receiver's round top; on it the housing, a low floor with the windage
// screw lying in it (no ears either side: the drum stands clear); the drum standing in
// the front of the housing leaning forward, a plain band at its foot, knurled above, the top a cup with its rim cut
// away front and back (the open notch) and an aperture through it; the detent's nub under its front
// the mag well, part of the gun (the mag that goes in it is its own: in the mag group). The plain MP5's off a side photo
// of one with no mag in (its front edge stepping in under the receiver, its lip sloping down and back to the trigger
// housing); the 10mm kit's (MP5/10) off a photo of an SP5/10: a squarer, straighter well a little longer at the front,
// its marking plate pressed into each side (MP5_PLATE10). Then the kit's straight 30-round 10mm Auto mag (MP5_MAG10),
// traced off the same photo, its catch lugs on its back edge, the wider floor plate on its foot, carried straight on up
// into the well; it runs down and forward at MP5_MAG10_TILT, two grooves pressed along each face (MP5_GROOVE10: how far
// in front of and behind its middle line)
const MP5_WELL = [[0.717, 1.115], [0.7985, 1.115], [0.7985, 1.0886], [0.7946, 1.0886], [0.7874, 1.0851], [0.785, 1.0804], [0.7847, 1.077], [0.7858, 1.0735], [0.784, 1.0624], [0.7846, 1.0503], [0.7825, 1.0489], [0.7813, 1.0431], [0.7794, 1.0422], [0.7752, 1.0413], [0.7596, 1.0363], [0.7548, 1.0341], [0.7318, 1.0275], [0.7273, 1.0289], [0.7197, 1.0632]];
const MP5_WELL10 = [[0.717, 1.115], [0.7985, 1.115], [0.7985, 1.0886], [0.7946, 1.0886], [0.7885, 1.0862], [0.7901, 1.0726], [0.7916, 1.0579], [0.7946, 1.0431], [0.7953, 1.0409], [0.7931, 1.0387], [0.7393, 1.0313], [0.7231, 1.1014]];
const MP5_PLATE10 = [0.7335, 1.0565, 0.7775, 1.0885];
const MP5_MAG10 = [[0.79658, 0.78607], [0.79529, 0.78611], [0.79439, 0.78758], [0.79179, 0.78929], [0.79068, 0.79148], [0.78643, 0.81411], [0.77119, 0.88192], [0.76812, 0.8926], [0.76736, 0.89371], [0.76546, 0.89408], [0.76477, 0.89629], [0.76528, 0.8996], [0.76624, 0.90182], [0.76456, 0.91103], [0.76305, 0.91346], [0.75973, 0.9134], [0.75873, 0.91434], [0.7597, 0.91803], [0.7622, 0.91877], [0.76248, 0.92024], [0.75198, 0.96778], [0.7505, 0.97036], [0.74683, 0.97041], [0.74582, 0.97109], [0.74646, 0.97289], [0.74978, 0.97474], [0.74993, 0.97662], [0.73766, 1.03116], [0.7303, 1.066], [0.7852, 1.066], [0.79125, 1.03816], [0.81869, 0.91404], [0.82301, 0.89813], [0.82521, 0.88486], [0.83858, 0.82554], [0.84006, 0.82177], [0.84731, 0.81595], [0.85056, 0.80269], [0.84927, 0.8006], [0.84864, 0.79827], [0.84828, 0.79716], [0.84596, 0.79618]];
const MP5_MAG10_TILT = 0.2207, MP5_MAG10_C = [0.7645, 1.034], MP5_GROOVE10 = [-0.0105, 0.0115];
function mp5Mag10(mg) {
  const P = GM.poly; solid(mg, MP5_MAG10, 0.026, P, X, 0.003);
  const c = Math.cos(MP5_MAG10_TILT), sn = Math.sin(MP5_MAG10_TILT), L = 0.19, s0 = 0.02;   // (down the mag: +z sn, -y c; across it, forward: z c, y sn)
  MP5_GROOVE10.forEach(o => { const m = s0 + L / 2; const b = box(mg, 0.0264, L, 0.0024, GM.rubber, X, MP5_MAG10_C[1] - m * c + o * sn, MP5_MAG10_C[0] + m * sn + o * c); b.rotation.x = -MP5_MAG10_TILT; });
}
const MP5_TILT = 0.35, MP5_DRUM = { y: 1.1784, z: 0.5725, r: 0.013 };
// how far the claw mount lifts an optic over the receiver, clear of the drum sight
const MP5_CLAW = 0.03;
// the drum's aperture: wide enough to frame the hooded front sight's ring round its post, as you see it
const MP5_AP = 0.0029, MP5_HOLE = 0.0158;   // (and how far up the drum it is)
// the drum's top band is built in level slices along the gun (mp5Rear): enough of them that its leaning top edge reads as
// one smooth slope, not a staircase, close up to your eye; and your eye's this far behind the hole looking through it,
// clear of the sight's housing and clamp (the housing runs back a good way behind the drum, and nearer than this it
// pushes into the view's near edge)
const MP5_SLICES = 64, MP5_RELIEF = 0.16;
function mp5Rear(g) {
  const K = GM.metal, M2 = GM.metal2, R = MP5.rw, yc = MP5.top - R, D = MP5_DRUM;
  { const sh = new THREE.Shape(), w = 0.0159, rb = R - 0.0003, a0 = Math.atan2(Math.sqrt(rb * rb - w * w), w);
    sh.moveTo(X + w, 1.1792); sh.lineTo(X - w, 1.1792); sh.absarc(X, yc, rb, Math.PI - a0, a0, true); sh.closePath();
    xsec(g, sh, 0.5249, 0.5914, K, 0.0006); }                                                                              // the clamp plate
  solid(g, [[0.5262, 1.176], [0.5262, 1.1805], [0.5318, 1.1812], [0.5352, 1.1868], [0.5665, 1.1868], [0.5665, 1.176]], 0.028, K, X, 0.0006);   // the housing's floor
  { const ws = lathe(g, [[0, 0], [0.0054, 0], [0.0054, 0.0006], [0.0042, 0.0014], [0, 0.0016]], M2, X, 1.1868, 18); ws.rotation.x = -Math.PI / 2; ws.position.z = 0.5505; }   // the windage screw
  box(g, 0.0094, 0.0008, 0.001, GM.rubber, X, 1.1884, 0.5505).rotation.y = 0.5;                                              // and its slot
  cyl(g, 0.0032, 0.016, GM.steel, X, 1.1796, 0.5908, 14).rotation.set(0, 0, Math.PI / 2);                                  // the detent's nub
  const d = new THREE.Group(); d.position.set(X, D.y, D.z); d.rotation.x = MP5_TILT - Math.PI / 2; g.add(d); apPart(d);   // (its z up the drum, its y back)
  lathe(d, [[0, 0], [D.r - 0.0006, 0], [D.r - 0.0006, 0.003], [D.r - 0.0012, 0.0035], [0, 0.0035]], M2, 0, 0, 32);      // the plain band
  knurl(d, D.r, 0.003, K, 0, 0, 0.005, 26, 1, 0.0007);                                                                    // the knurling below the aperture's band
  // the drum's top band, knurled, with the aperture through it just under its top edge (as you see it looking through:
  // the knurled top of the drum standing up over the housing, the hole near its top): level slices along the gun, each
  // as wide as the leaning drum is there and as tall as it is there (its top and its foot lean with it), the hole
  // straight through them down the gun; where the lean brings the top down past the hole (the front of the drum), the
  // hole's an open notch in that slice, so from behind it's a whole round hole
  const T = Math.tan(MP5_TILT), h = MP5_HOLE, yr = D.y + h * Math.cos(MP5_TILT), Rz = D.r / Math.cos(MP5_TILT), n = MP5_SLICES, r = MP5_AP;
  const at = a => [D.y + a * Math.cos(MP5_TILT), D.z + a * Math.sin(MP5_TILT)];   // (a point up the drum's axis: its height and how far along)
  const [yb0, zb0] = at(0.0065), [yt0, zt0] = at(0.0195), cz = at(h)[1];
  for (let i = 0; i < n; i++) {
    const z0 = cz - Rz + i * 2 * Rz / n, z1 = z0 + 2 * Rz / n, zm = (z0 + z1) / 2, zin = z0 < cz && z1 > cz ? 0 : Math.min(Math.abs(z0 - cz), Math.abs(z1 - cz)), w = D.r * Math.sqrt(1 - (zin / Rz) ** 2);
    const yb = yb0 - (zm - zb0) * T, yt = yt0 - (zm - zt0) * T;
    let sh;
    if (yt >= yr + r) { sh = shp([[X - w, yb], [X + w, yb], [X + w, yt], [X - w, yt]]); const hole = new THREE.Path(); hole.absarc(X, yr, r, 0, Math.PI * 2, true); sh.holes.push(hole); }
    else if (yt > yr - r) {   // (the top's come down through the hole: an open notch)
      const rr2 = Math.sqrt(r * r - (yt - yr) ** 2), a0 = Math.atan2(yt - yr, rr2);
      sh = new THREE.Shape(); sh.moveTo(X - w, yb); sh.lineTo(X + w, yb); sh.lineTo(X + w, yt); sh.lineTo(X + rr2, yt); sh.absarc(X, yr, r, a0, Math.PI - a0, true); sh.lineTo(X - w, yt); sh.closePath();
    } else sh = shp([[X - w, yb], [X + w, yb], [X + w, yt], [X - w, yt]]);
    apPart(xsec(g, sh, z0, z1, K));
  }
  irons(g, { kind: 'ap', yr, rz: D.z, r: MP5_AP, relief: MP5_RELIEF });   // (looked through in first person: game/view-cam.js)
}
// Gun models. Each builder adds meshes to the group g (axis +z is the barrel, X is the right-hand offset)
// and returns where the muzzle is plus mount points for magazines, sights and the moving slide or bolt.
// a shotgun shell's hull by the kind loaded (weapons/rounds.js): flechettes white, dragon's breath orange, slugs blue,
// buckshot red. Everywhere a shell shows: the pump's side saddle, a band round the auto shotgun's mag, the shells in the
// hand as they're fed in (player/hold.js), the chest rig's shell pouch (player/gear.js), the hulls thrown out
// (SHELL_HULL, weapons/casings.js) and the HUD's shells (#rounds.rflech and the rest, styles/hud-weapon.css)

export const SMG_MODELS = {
  // machine pistol: a B&T MP9, its outline traced off a side-on photo. A slim receiver with grooves down its front
  // half, a rail along the top with a little front sight on its end and the rear sight leaning back behind it; the
  // T-handle's wings at the very back (pulled on a reload, like the rifle's), the hinge block under them where the stock
  // folds; a threaded muzzle; the ejection port on the right. Under it the vertical foregrip raked forward with the
  // finger hook in front of it, the slanted trigger guard, the grip with its ridges front and back and the safety button,
  // the magazine in the grip with its count windows; the stock out: a flat bar to a tall butt that leans back at the toe
  smg(g, m) {
    const P = GM.poly, K = GM.metal, mg = g.userData.magG || g, mt = T('mag');
    // ---- receiver (the rear hinge block under the handle), rail and slots, the sights, the threaded muzzle
    profile(g, shp(inset([[0.8684, 1.159], [0.8776, 1.1484], [0.8847, 1.1378], [0.8895, 1.131], [0.8985, 1.128], [0.8985, 1.097], [0.906, 1.0945], [0.906, 1.0915], [0.8985, 1.089], [0.8985, 1.062], [0.53, 1.0595], [0.5271, 1.0636], [0.4762, 1.0681], [0.4662, 1.0725], [0.4631, 1.0815], [0.4607, 1.0846], [0.4471, 1.0857], [0.4471, 1.1107], [0.4495, 1.1205], [0.4538, 1.1216], [0.4812, 1.1217], [0.4851, 1.1234], [0.4855, 1.1375], [0.4877, 1.164], [0.5613, 1.164], [0.566, 1.159]], 0.003)), 0.04, P, X, 0.003);
    xsec(g, shp([[X - 0.011, 1.158], [X + 0.011, 1.158], [X + 0.0125, 1.1615], [X + 0.011, 1.1656], [X - 0.011, 1.1656], [X - 0.0125, 1.1615]]), 0.578, 0.842, K, 0.0006);
    for (let k = 0; k < 16; k++) box(g, 0.026, 0.0034, 0.0072, GM.rubber, X, 1.1648, 0.5875 + k * 0.0157);
    profile(g, shp([[0.838, 1.164], [0.862, 1.159], [0.851, 1.1806], [0.844, 1.1806]]), 0.004, K, X, 0.0006);                                    // front sight, a thin post up level with the rear's top
    { const RS = [[0.5368, 1.163], [0.5613, 1.163], [0.5418, 1.1806], [0.5392, 1.1806], [0.5368, 1.1707]];                                         // rear sight, leaning back, its notch down the middle
      [-1, 1].forEach(sd => profile(g, shp(RS), 0.0085, K, X + sd * 0.00675, 0.0006)); profile(g, shp(RS.map(([z, y]) => [z, Math.min(y, 1.1766)])), 0.006, K, X, 0.0004); }
    irons(g, { kind: 'notch', yr: 1.1806, rz: 0.5405, yf: 1.1806, fz: 0.8475 });
    box(g, 0.008, 0.008, 0.004, GM.rubber, X, 1.174, 0.5395);
    for (let k = 0; k < 5; k++) [-1, 1].forEach(sd => { const y = 1.149 - k * 0.0075, z1 = zAt([[0.8684, 1.159], [0.8776, 1.1484], [0.8847, 1.1378], [0.8895, 1.131], [0.8985, 1.128], [0.8985, 1.1]], y) - 0.008; box(g, 0.0014, 0.0022, z1 - 0.772, GM.rubber, X + sd * 0.0232, y, (z1 + 0.772) / 2); });   // the grooves down its front half
    box(g, 0.0016, 0.016, 0.045, GM.rubber, X + 0.0232, 1.105, 0.68);   // the plate on its left
    cyl(g, 0.0183, 0.041, K, X, 1.113, 0.9185, 18); for (let k = 0; k < 5; k++) ring(g, 0.0186, 0.0025, GM.rubber, X, 1.113, 0.906 + k * 0.006); cyl(g, 0.0062, 0.002, GM.rubber, X, 1.113, 0.9395, 12);
    let front = 0.94;
    if (m.ported) { const e = 0.04 + 0.01 * (m.ported - 1); cyl(g, 0.0172, e, K, X, 1.113, 0.939 + e / 2, 18); for (let k = 0; k < 3; k++) box(g, 0.012, 0.004, 0.008, GM.rubber, X, 1.1295, 0.947 + k * (e - 0.012) / 2.6); cyl(g, 0.006, 0.002, GM.rubber, X, 1.113, 0.94 + e, 12); front += e; }   // a ported extension, longer each level
    // ---- the T-handle's wings at the back (the reload pulls it, player/hold.js)
    const ch = new THREE.Group(); g.add(ch);
    profile(ch, shp(inset([[0.4895, 1.1462], [0.5165, 1.1462], [0.5165, 1.1686], [0.4895, 1.1686]], 0.002)), 0.054, K, X, 0.002);
    [-1, 1].forEach(sd => { for (let k = 0; k < 4; k++) box(ch, 0.001, 0.016, 0.002, GM.rubber, X + sd * 0.0285, 1.1574, 0.494 + k * 0.006); });
    // ---- the port on the right, and the bolt in it
    profile(g, shp([[0.6, 1.12], [0.68, 1.12], [0.68, 1.146], [0.6, 1.146]]), 0.002, GM.rubber, X - 0.0232, 0.0004);
    const bc = box(g, 0.003, 0.021, 0.05, GM.steel, X - 0.0243, 1.133, 0.655); bc.userData.clip = 0.6;   // it runs right back out of sight past the port's rear edge
    // ---- the foregrip (the finger hook in front of it) and its ridges
    const FF = [[0.8763, 0.9236], [0.8723, 0.9593], [0.8672, 0.9862], [0.8584, 1.0202], [0.8489, 1.0482]], FB = [[0.8217, 0.9142], [0.82, 0.9159], [0.8127, 0.9482], [0.8064, 0.9936], [0.8048, 1.0359]];
    profile(g, shp(inset([[0.8292, 0.9133], [0.8678, 0.9189], [0.8736, 0.9207], ...FF, [0.8478, 1.0566], [0.8495, 1.0615], [0.8562, 1.0679], [0.8794, 1.071], [0.8966, 1.0735], [0.8966, 1.0815], [0.8946, 1.085], [0.7684, 1.0854], [0.7649, 1.0834], [0.765, 1.0483], [0.7714, 1.0527], [0.7753, 1.0527], [0.7891, 1.0477], [0.7976, 1.0397], [0.8036, 1.0379], ...FB.slice().reverse()], 0.003)), 0.03, P, X, 0.003);
    profile(g, shp([[0.8794, 1.0725], [0.8873, 1.0667], [0.8925, 1.056], [0.8952, 1.0472], [0.8985, 1.0478], [0.8988, 1.06], [0.8975, 1.0765], [0.888, 1.0775]]), 0.022, P, X, 0.001);   // the finger hook
    for (let k = 0; k < 9; k++) { const y = 0.978 + k * 0.0052, z0 = zAt(FB, y) + 0.005, z1 = zAt(FF, y) - 0.005; [-1, 1].forEach(sd => box(g, 0.0012, 0.0018, z1 - z0, GM.rubber, X + sd * 0.0181, y, (z0 + z1) / 2)); }
    // ---- trigger guard, trigger, the grip and its ridges, the safety
    profile(g, shp([[0.6943, 1.024], [0.7343, 1.0238], [0.7422, 1.0258], [0.748, 1.0298], [0.77, 1.0518], [0.7751, 1.0538], [0.7752, 1.0658], [0.7717, 1.0678], [0.6873, 1.0674], [0.6853, 1.0639], [0.6854, 1.0299], [0.6874, 1.0263]],
      [shp([[0.742, 1.0595], [0.748, 1.055], [0.7541, 1.0463], [0.7431, 1.0353], [0.7376, 1.0325], [0.6925, 1.0325], [0.6897, 1.035], [0.6897, 1.0595]])]), 0.02, P, X, 0.0015);
    profile(g, shp([[0.7165, 1.0598], [0.7149, 1.0567], [0.7137, 1.0535], [0.7131, 1.0504], [0.7131, 1.0473], [0.7138, 1.0442], [0.7152, 1.0411], [0.7172, 1.0379], [0.7198, 1.0348], [0.7189, 1.0336], [0.7157, 1.0348], [0.7125, 1.0379], [0.7099, 1.0411], [0.7079, 1.0442], [0.7065, 1.0473], [0.7059, 1.0504], [0.706, 1.0535], [0.7065, 1.0567], [0.7075, 1.0598]]), 0.007, K, X, 0.0008);   // the trigger, curving forward
    const GF = [[0.6644, 0.9198], [0.665, 0.9764], [0.6775, 1.0201], [0.6816, 1.0248]], GBk = [[0.5806, 0.9174], [0.5809, 0.9725], [0.5954, 1.0274], [0.596, 1.0461]];
    profile(g, shp(inset([[0.5923, 0.9148], [0.66, 0.911], ...GF, [0.6886, 1.0267], [0.6897, 1.0288], [0.6897, 1.065], [0.6885, 1.07], [0.5539, 1.07], [0.5508, 1.0676], [0.5503, 1.063], [0.5522, 1.0605], [0.5762, 1.056], [0.5946, 1.0489], ...GBk.slice().reverse()], 0.003)), 0.036, P, X, 0.003);
    for (let k = 0; k < 11; k++) { const y = 0.928 + k * 0.0068; [-1, 1].forEach(sd => { const f = zAt(GF, y); box(g, 0.0012, 0.0018, 0.014, GM.rubber, X + sd * 0.0211, y, f - 0.011); if (y < 1.012) { const b = zAt(GBk, y); box(g, 0.0012, 0.0018, 0.016, GM.rubber, X + sd * 0.0211, y, b + 0.012); } }); }
    cyl(g, 0.0058, 0.044, K, X, 1.041, 0.6727, 14).rotation.set(0, 0, Math.PI / 2);   // the safety button through the grip
    // ---- the stock, out: the flat bar, the butt leaning back at its toe, the pin through it. One of a pair has it
    // folded, swung round its hinge flat along the right of the receiver with the butt beside the guard (so a gun
    // tucked against the chest for a two-handed reload doesn't jab its stock up into the chin)
    let sk = g;
    if (m.akimbo2) { const H = [X - 0.017, 0, 0.447], f = new THREE.Group(); f.position.set(H[0], 0, H[2]); f.rotation.y = Math.PI; g.add(f); sk = new THREE.Group(); sk.position.set(-H[0], 0, -H[2]); f.add(sk); }
    profile(sk, shp([[0.452, 1.1095], [0.262, 1.1095], [0.262, 1.0822], [0.357, 1.0835], [0.4327, 1.0873], [0.452, 1.0873]]), 0.012, K, X, 0.001);
    profile(sk, shp([[0.4327, 1.0873], [0.4471, 1.0873], [0.4471, 1.1107], [0.4327, 1.1107]]), 0.026, K, X, 0.0015);   // its knuckle on the hinge
    box(sk, 0.0135, 0.0025, 0.16, GM.rubber, X, 1.0985, 0.355);   // the groove down the bar
    profile(sk, shp(inset([[0.185, 0.9272], [0.2017, 0.9283], [0.2068, 0.933], [0.2277, 1.0321], [0.2239, 1.0446], [0.224, 1.0523], [0.2299, 1.0606], [0.2381, 1.0645], [0.2485, 1.074], [0.2688, 1.0822], [0.2695, 1.1068], [0.2676, 1.1103], [0.1965, 1.1084], [0.1906, 1.1066], [0.188, 1.1037], [0.1864, 1.0696], [0.1837, 1.0617], [0.1811, 0.9729], [0.1782, 0.9363], [0.1794, 0.9309]], 0.003)), 0.024, P, X, 0.003);
    cyl(sk, 0.0042, 0.032, GM.steel, X, 0.997, 0.2015, 12).rotation.set(0, 0, Math.PI / 2);
    // ---- the magazine: its top up in the grip, a stick longer each tier with its count windows, or a drum at the top
    box(mg, 0.0256, 0.15, 0.0552, K, X, 0.995, 0.629);   // (a hair inside the grip it sits up in, so their faces don't flicker through each other)
    if (mt < 3) {
      const L = 0.133 + 0.05 * mt, yb = 0.912 - L;
      profile(mg, shp(inset([[0.5993, 0.925], [0.66, 0.925], [0.66, yb + 0.028], [0.6585, yb + 0.002], [0.654, yb], [0.6074, yb], [0.6014, yb + 0.002], [0.5991, yb + 0.006]], 0.002)), 0.026, P, X, 0.002);
      [-1, 1].forEach(sd => { for (let k = 0; k < 3 + mt; k++) box(mg, 0.001, 0.016, 0.007, GM.rubber, X + sd * 0.0149, 0.885 - k * 0.04, 0.646); });
    } else {
      profile(mg, shp(inset([[0.5993, 0.925], [0.66, 0.925], [0.66, 0.885], [0.5993, 0.885]], 0.002)), 0.026, P, X, 0.002);
      // a drum lying along the gun under the neck, its face forward like the pistol's (its axis down the gun), the hub
      // showing at either end, a seam round each rim and the winding key at the back
      const cy = 0.885 - 0.07, r = 0.07, dl = 0.07, along = m => { m.rotation.set(Math.PI / 2, 0, 0); return m; };
      along(cyl(mg, r, dl, P, X, cy, 0.629, 32)); along(cyl(mg, 0.026, dl + 0.006, K, X, cy, 0.629, 18));
      [-1, 1].forEach(e => along(ring(mg, r + 0.0015, 0.006, K, X, cy, 0.629 + e * (dl / 2 - 0.006))));
      box(mg, 0.034, 0.008, 0.006, GM.rubber, X, cy, 0.629 - dl / 2 - 0.006);   // the winding key
    }
    return { front, y: 1.113, magZ: 0.629, magY: 0.89, slide: bc, bolts: [], travel: 0.085, lock: true, top: 1.1656, sz: 0.7, ownMags: true, charge: ch, chargeAt: [X, 1.163, 0.503], laser: { side: -1, x: X - 0.0215, y: 1.1, z: 0.83 } };   // the laser on the right-hand rail
  },
  // SMG: an H&K MP5A2, traced off a side-on photo (and the MP5SD's can off another). The fixed A2 stock with its rubber
  // butt plate and sling slots; the stamped receiver tube with a rib down each side, the drum rear sight on top and the
  // ejection port on the right; the cocking tube running forward over the barrel to the hooded front sight, its handle on
  // the left (pulled back and slapped down on a reload); the slim handguard with a flute down each side; the barrel's
  // nub; the polymer trigger housing with the grip and the guard in one; the curved magazine, longer with each
  // magazine upgrade. Its suppressor line (the SD's integral can) swaps the handguard and barrel for the SD's ribbed
  // handguard round the back of a fat can, its bare front longer each level
  sub(g, m) {
    const P = GM.poly, K = GM.metal, St = GM.steel, mg = g.userData.magG || g, sd = T('supp');   // its suppressor line is the SD's integral can
    // ---- the stock: the A2's moulded polymer, its edges rounded right over and slimmer through the wrist than at the butt
    // or where it takes the receiver (STK_W); the rubber butt pad ribbed down its face; the sling plate on the left (a
    // hexagon round a slot with a bar across it), two plugs on the right
    const stk = new THREE.Group(); g.add(stk);
    solid(stk, [[0.146, 1.1268], [0.1674, 1.1274], [0.3683, 1.1302], [0.3778, 1.1313], [0.3947, 1.1346], [0.4125, 1.1399], [0.429, 1.148], [0.453, 1.1626], [0.4637, 1.1683], [0.4654, 1.1698], [0.4836, 1.1801], [0.4903, 1.1818], [0.497, 1.1822], [0.505, 1.1818], [0.505, 1.0642], [0.4705, 1.0641], [0.4663, 1.0648], [0.4552, 1.0684], [0.4417, 1.0687], [0.4342, 1.068], [0.411, 1.0595], [0.3822, 1.0476], [0.3661, 1.0411], [0.3217, 1.0234], [0.2965, 1.0132], [0.2701, 1.0024], [0.2542, 0.9967], [0.2247, 0.9846], [0.2009, 0.9744], [0.1903, 0.9708], [0.1843, 0.9678], [0.1796, 0.9669], [0.1606, 0.9659], [0.15, 0.9662]], 0.044, P, X, 0.017);
    solid(stk, [[0.1393, 1.1188], [0.1401, 1.1217], [0.1425, 1.1239], [0.148, 1.1261], [0.159, 1.1273], [0.159, 0.966], [0.1557, 0.9661], [0.151, 0.9684], [0.1482, 0.9725], [0.1464, 0.9834], [0.1461, 1.0049], [0.1443, 1.0245], [0.1437, 1.0465], [0.1429, 1.0565], [0.1419, 1.0593], [0.1407, 1.0833], [0.1395, 1.0937]], 0.046, GM.rubber, X, 0.008);
    taperX(stk, STK_W);
    for (let k = -2; k <= 2; k++) { const r = box(g, 0.0024, 0.13, 0.002, GM.rubber, X + k * 0.0072, 1.044, 0.1418); r.rotation.x = -0.053; }   // the pad's ribs
    { const zs = 0.218, xs = X + 0.022 * STK_W(zs); const hx = new THREE.Mesh(new THREE.CylinderGeometry(0.0172, 0.0172, 0.003, 6), GM.metal2); hx.position.set(xs, 1.062, zs); hx.rotation.set(Math.PI / 6, 0, Math.PI / 2); hx.castShadow = true; g.add(hx);
      box(g, 0.0012, 0.019, 0.011, GM.rubber, xs + 0.0016, 1.062, zs); box(g, 0.004, 0.021, 0.0042, K, xs + 0.0025, 1.062, zs); }   // the sling plate, its slot and bar
    [0.222, 0.308].forEach(z => cyl(g, 0.0055, 0.002, GM.rubber, X - 0.022 * STK_W(z) - 0.0004, 1.079, z, 12).rotation.set(0, 0, Math.PI / 2));   // the plugs
    // ---- the upper, on the lines traced off the photo but built round, the way the steel really is: the receiver a tube
    // with flat sides and a round top, the channel pressed down each side with its lip standing out (mp5Section), the
    // mag well under its front, the drum rear sight on top (mp5Rear) with the notched claw-mount tabs ahead of it; the
    // port on the right with the bolt in it
    // (the channel stops short of the mag well, and on the right round the port; its ends are rounded off)
    [[0.47, 0.595, 1, 1], [0.595, 0.665, 1, 0], [0.665, 0.711, 1, 1], [0.711, MP5.rcvEnd, 0, 0]].forEach(([z0, z1, l, r]) => xsec(g, mp5Section(l, r), z0, z1, K, 0));
    [[1, 0.711], [-1, 0.711], [-1, 0.595], [-1, 0.665]].forEach(([s2, z]) => cyl(g, 0.0102, 0.0052, K, X + s2 * (MP5.rw - 0.0026), 1.1398, z, 16).rotation.set(0, 0, Math.PI / 2));
    [[1, 0.48, 0.705], [-1, 0.48, 0.59], [-1, 0.67, 0.705]].forEach(([s2, z0, z1]) => box(g, 0.0006, 0.0062, z1 - z0, GM.rubber, X + s2 * (MP5.rw - 0.0047), 1.1462, (z0 + z1) / 2));   // the shadow up under its top edge
    const ten = hasMod('tenmm');   // (the 10mm conversion kit: its own well and mag, MP5_WELL10)
    if (!ten) solid(g, MP5_WELL, 0.044, K, X, 0.004);                                                                  // the mag well
    else {
      solid(g, MP5_WELL10, 0.046, K, X, 0.004);
      const [z0, y0, z1, y1] = MP5_PLATE10;
      [-1, 1].forEach(s2 => { profile(g, shp(rrect(z0, y0, z1, y1, 0.004).getPoints().map(q => [q.x, q.y])), 0.0016, K, X + s2 * 0.0232, 0.0004);   // its marking plate, pressed in
        [0.0095, 0.016, 0.0225].forEach((dy, k) => box(g, 0.0005, 0.0012, (z1 - z0) * [0.62, 0.54, 0.46][k], GM.metal2, X + s2 * 0.0241, y1 - dy, (z0 + z1) / 2)); });   // and its lettering
    }
    mp5Rear(g);
    // with an optic: the claw mount clamped onto the tabs, a rail on top lifting the optic clear over the drum sight
    const claw = T('sight') ? MP5_CLAW : 0;
    if (claw) {
      xsec(g, shp([[X - 0.0125, 1.1742 + claw - 0.006], [X + 0.0125, 1.1742 + claw - 0.006], [X + 0.0125, 1.1742 + claw], [X - 0.0125, 1.1742 + claw]]), 0.6, 0.735, GM.rail, 0.0006);   // the rail
      [0.615, 0.72].forEach(z => [-1, 1].forEach(s2 => box(g, 0.005, claw, 0.018, K, X + s2 * 0.0128, 1.1742 + claw / 2 - 0.003, z)));   // its claws down onto the tabs
      cyl(g, 0.006, 0.006, GM.metal2, X + 0.0175, 1.1742 + claw * 0.4, 0.668, 14).rotation.set(0, 0, Math.PI / 2);   // the lever's knob
    }
    [0.667, 0.6913].forEach(z => { const t = MP5.top; solid(g, [[z - 0.0042, t - 0.002], [z - 0.0042, t + 0.001], [z - 0.0024, t + 0.0036], [z + 0.0024, t + 0.0036], [z + 0.0042, t + 0.001], [z + 0.0042, t - 0.002]], 0.016, K, X, 0.0005);
      box(g, 0.0168, 0.0016, 0.0014, GM.rubber, X, t + 0.0029, z); });                                              // the claw-mount tabs, notched for the claws
    profile(g, shp([[0.6, 1.128], [0.66, 1.128], [0.66, 1.156], [0.6, 1.156]]), 0.002, GM.rubber, X - 0.0222, 0.0004);   // the port, and its bolt
    const bc = box(g, 0.003, 0.022, 0.05, St, X - 0.0232, 1.142, 0.63); bc.userData.clip = 0.6;
    // ---- the cocking tube's handle on the left, at the front of its slot (it stays forward as the gun fires: the bolt in
    // the port is what cycles): an arm angled out, up and forward, and the knurled ball on its end; the slot runs back
    // from it to the notch it's slapped up into
    const sl = new THREE.Group(); g.add(sl); mp5Handle(sl, MP5.handle);
    box(g, 0.0016, 0.0046, MP5.handle - 0.828, GM.rubber, X + MP5.ct.r - 0.0003, MP5.ct.y, (MP5.handle + 0.828) / 2);   // the slot
    { const n = box(g, 0.0016, 0.0046, 0.014, GM.rubber, X + MP5.ct.r - 0.0003, MP5.ct.y + 0.004, 0.83); n.rotation.x = -0.75; }   // and its notch
    let front;
    if (!sd) {
      solid(g, [[0.7975, 1.15], [1.0385, 1.15], [1.0365, 1.0966], [0.9969, 1.0933], [0.9489, 1.0878], [0.937, 1.0872], [0.8976, 1.0833], [0.8774, 1.0814], [0.8585, 1.0793], [0.8048, 1.0732], [0.8018, 1.0736], [0.7992, 1.0751], [0.798, 1.0791], [0.7969, 1.0869]], 0.052, P, X, 0.016);   // the handguard
      [-1, 1].forEach(s2 => box(g, 0.002, 0.007, 0.17, GM.rubber, X + s2 * 0.0262, 1.118, 0.925));                     // its flutes
      cyl(g, MP5.ct.r, MP5.fs - MP5.rcvEnd + 0.004, K, X, MP5.ct.y, (MP5.rcvEnd + MP5.fs) / 2, 24);                    // the cocking tube
      mp5Front(g, 0, true); front = MP5.muzzle;
    } else {
      // ---- the SD: its cocking tube and front sight further back, the ribbed handguard round the back of the can,
      // then the can's bare front, longer each level
      const L = 0.14 + 0.05 * (sd - 1), z1 = 1.023, z2 = z1 + L;
      cyl(g, MP5.ct.r, MP5.fs + MP5.sdShift - MP5.rcvEnd + 0.004, K, X, MP5.ct.y, (MP5.rcvEnd + MP5.fs + MP5.sdShift) / 2, 24);
      mp5Front(g, MP5.sdShift, false);
      ribTube(g, 0.034, z1 - 0.797, P, X, 1.12, (0.797 + z1) / 2, 18, 0.004, 1);
      heatAll([cyl(g, 0.0235, z2 - z1 + 0.01, K, X, 1.12, (z1 + z2) / 2, 22), ring(g, 0.025, 0.008, K, X, 1.12, z2 - 0.004), cyl(g, 0.006, 0.002, GM.rubber, X, 1.12, z2 + 0.0005, 10)], tierCtx);   // (the can, its ring and its end glow as it heats: effects/supp-heat.js)
      front = z2;
    }
    // ---- the trigger housing: the block, bevelled, the selector's markings side (its bottom runs along the top of the
    // guard's opening, then up into the grip); the guard a narrower loop under it, its front post coming down from the
    // block and its bar running back into the grip; the grip on its own, rounded right over (nearly oval across), its
    // heel flared; the mag release paddle hanging behind the magazine; the trigger hanging in the opening; the push
    // pins; the selector
    // (with the 10mm kit its front runs forward down the straight well's raked back, MP5_WELL10, just inside it, so
    // there's no gap between them: the SP5/10's lower)
    solid(g, [[0.4801, 1.0641], [0.4801, 1.1121], [0.7196, 1.1121], ...(ten ? [[0.7255, 1.1014], [0.7413, 1.0313], [0.7405, 1.0289]] : [[0.7197, 1.0632], [0.7273, 1.0289]]), [0.6906, 1.0277], [0.6249, 1.0297], [0.5389, 1.0635], [0.5237, 1.0645]], 0.04, P, X, 0.004);
    solid(g, [[0.6816, 1.032], [0.7201, 1.032], [0.7201, 1.0281], [0.716, 1.0274], [0.7111, 1.0279], [0.7048, 1.0249], [0.7022, 1.0225], [0.6993, 1.0178], [0.6869, 0.985], [0.6808, 0.9788], [0.6724, 0.9747], [0.635, 0.9749], [0.6254, 0.9766], [0.6107, 0.9841], [0.6037, 0.9834], [0.596, 0.985], [0.597, 0.9935], [0.6102, 0.9935], [0.6205, 0.9892], [0.6296, 0.9852], [0.6658, 0.9833], [0.6705, 0.9838], [0.6758, 0.9864], [0.6814, 0.9929], [0.6914, 1.0212], [0.6916, 1.0243], [0.6906, 1.0269], [0.6878, 1.0282], [0.6816, 1.0289]], 0.022, P, X, 0.0025);   // the guard
    profile(g, shp(inset([[0.6249, 1.0297], [0.6222, 1.0287], [0.6161, 1.0178], [0.6098, 1.0038], [0.609, 0.9997], [0.6102, 0.9963], [0.6045, 0.9875], [0.5992, 0.9797], [0.595, 0.9739], [0.5849, 0.9511], [0.5665, 0.9134], [0.5661, 0.9097], [0.5673, 0.9043], [0.5669, 0.9016], [0.5646, 0.8986], [0.5616, 0.8978], [0.5562, 0.8986], [0.5308, 0.9121], [0.5035, 0.9291], [0.4966, 0.9343], [0.4954, 0.9361], [0.4948, 0.9386], [0.4967, 0.9432], [0.5051, 0.9552], [0.5125, 0.9675], [0.5191, 0.9764], [0.5264, 0.9885], [0.5393, 1.0073], [0.5407, 1.0103], [0.5506, 1.0243], [0.5546, 1.0339], [0.5549, 1.0403], [0.5525, 1.049], [0.5482, 1.0569], [0.5445, 1.0603], [0.5389, 1.0635], [0.535, 1.085], [0.628, 1.085]], 0.013)), 0.01, P, X, 0.013, 6);   // the grip (as solid, with more steps round its edges)
    solid(g, [[0.7273, 1.034], [0.7273, 1.0289], [0.7237, 1.0222], [0.7229, 1.0162], [0.72, 1.0132], [0.7186, 1.0099], [0.7155, 1.0084], [0.7144, 1.0111], [0.7201, 1.0246], [0.7201, 1.034]], 0.012, K, X, 0.0008);   // the mag release paddle
    profile(g, shp([[0.6296, 1.047], [0.6488, 1.047], [0.6488, 1.0287], [0.6458, 1.0245], [0.6427, 1.0185], [0.6418, 1.0132], [0.6424, 1.0049], [0.6498, 0.9902], [0.6492, 0.9877], [0.6465, 0.987], [0.6421, 0.9889], [0.64, 0.9907], [0.6376, 0.9937], [0.6344, 1.0], [0.6325, 1.0122], [0.6335, 1.0242], [0.6326, 1.0271], [0.6296, 1.0295]]), 0.008, P, X, 0.0008);
    [[0.513, 1.089], [0.709, 1.093]].forEach(([z, y]) => { cyl(g, 0.0042, 0.0432, GM.metal2, X, y, z, 14).rotation.set(0, 0, Math.PI / 2); cyl(g, 0.0016, 0.0434, GM.rubber, X, y, z, 10).rotation.set(0, 0, Math.PI / 2); });   // the push pins holding it on, standing out each side
    { const lv = box(g, 0.003, 0.006, 0.026, St, X + 0.0215, 1.085, 0.66); lv.rotation.x = 0.5; cyl(g, 0.006, 0.003, St, X + 0.021, 1.085, 0.655, 12).rotation.set(0, 0, Math.PI / 2); }
    // ---- the curved magazine (in the mag group so the reload drops it), longer with each magazine upgrade: its spines
    // rounded front and back, a raised panel pressed down each side, the floor plate on its foot with the pin through it
    // (its last step's no longer stick but a round 50-round drum under a short feed tower: mp5Drum)
    if (ten) { mp5Mag10(mg); return { front, y: 1.119, magZ: 0.765, magY: 1.05, slide: bc, bolts: [], travel: 0.065, lock: true, top: 1.1742 + claw, sz: 0.66, ownMags: true, laser: { y: sd ? 1.088 : 1.0867, z: 0.88 } }; }
    if (T('mag') >= 2) { mp5Drum(mg, K); return { front, y: 1.119, magZ: 0.772, magY: 1.07, slide: bc, bolts: [], travel: 0.065, lock: true, top: 1.1742 + claw, sz: 0.66, ownMags: true, laser: { y: sd ? 1.088 : 1.0867, z: 0.88 } }; }
    const k = [1, 1.3, 1.6, 1.9][T('mag')], dd = [0.085, -0.218], ext = ([z, y]) => { const f = clamp((1.05 - y) / 0.21, 0, 1) * (k - 1); return [z + dd[0] * f, y + dd[1] * f]; };
    const MO = [[0.7225, 1.0578], [0.7879, 1.0573], [0.7887, 1.0528], [0.7859, 1.0474], [0.7907, 1.0248], [0.8017, 0.9825], [0.8103, 0.9563], [0.8253, 0.9181], [0.8405, 0.8865], [0.8583, 0.8542], [0.8573, 0.849], [0.8223, 0.8286], [0.8162, 0.8315], [0.8099, 0.842], [0.7895, 0.8815], [0.7756, 0.9123], [0.7582, 0.9606], [0.7477, 0.9966], [0.743, 1.0183], [0.738, 1.0315], [0.7271, 1.0286], [0.7225, 1.03]].map(ext);
    solid(mg, MO, 0.026, K, X, 0.005);
    solid(mg, inset(MO, 0.0105), 0.0278, K, X, 0.0007);                                                                          // the panel
    { const b1 = ext([0.8223, 0.8286]), b2 = ext([0.8573, 0.849]), l = Math.hypot(b2[0] - b1[0], b2[1] - b1[1]), u = [(b2[0] - b1[0]) / l, (b2[1] - b1[1]) / l];
      const at = (p, a, b) => [p[0] + u[0] * a - u[1] * b, p[1] + u[1] * a + u[0] * b];   // a along the foot, b up into the mag
      solid(mg, [at(b1, -0.005, -0.0015), at(b2, 0.005, -0.0015), at(b2, 0.005, 0.007), at(b1, -0.005, 0.007)], 0.0295, K, X, 0.0012);   // the floor plate
      const c = at(b1, l / 2, 0.0028); cyl(mg, 0.0019, 0.0298, GM.rubber, X, c[1], c[0], 10).rotation.set(0, 0, Math.PI / 2); }      // its pin
    return { front, y: 1.119, magZ: 0.772, magY: 1.07, slide: bc, bolts: [], travel: 0.065, lock: true, top: 1.1742 + claw, sz: 0.66, ownMags: true, laser: { y: sd ? 1.088 : 1.0867, z: 0.88 } };   // the laser clamped under the handguard
  },
};
