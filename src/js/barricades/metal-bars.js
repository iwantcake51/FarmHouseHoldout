// Metal grates over the doors and windows, once the sawhorse is a metalwork bench (forgeMetal): one piece of steel per
// opening in place of the three boards, a cage of rebar on the inside face and, tier by tier, steel plate bolted over
// more of the outside. How it wears under the blows, how it breaks, and the bench itself.

import { GI } from '../ui/game-icons.js';
import { scene, V3 } from '../core/renderer.js';
import { clamp, rand, rr, smooth } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { box, finePieces, mergeInto, unfight } from '../core/geometry.js';
import { openings } from '../world/house.js';
import { torus, xcyl, ycyl, zcyl } from '../world/props.js';
import { STATIONS } from '../stations/stations.js';
import { P } from '../player/player.js';
import { run, S } from '../game/run-state.js';
import { burst } from '../effects/particles.js';
import { fx, sparkBurst } from '../effects/puffs.js';
import { BOARD_HP, BRACE, braceMul, METAL, setFlowDirty, setLightsDirty } from './planks.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { runStat } from '../ui/run-stats.js';
import { feed, popEl } from '../ui/hud-text.js';
import { visAt } from '../lighting/vision.js';
import { openSide } from '../zombies/ai.js';
import { gotGear } from '../ui/gear-popup.js';
import { netMetal } from '../net/sync.js';

// a grate costs GRATE.cost metal (the plank count: S.planks) and takes GRATE.t of holding F at your boarding speed
// (boardRate: slower again in a wave) to bolt up, against BOARD_T for each board; GRATE.tear of holding C to wrench
// down. Bare, it's GRATE.over times as strong as three boards braced all the way (BRACE.max) together, times the
// hammers' S.boardMul, and each tier of plating (GRATE.up: its price, dearer each time) makes every grate GRATE.tierHp
// stronger again
export const GRATE = { cost: 3, t: 2.6, tear: 2.4, over: 1.25, tierHp: 0.3, tiers: 5, rows: 5, up: [18, 26, 36, 48, 64], slitY: 1.45, slitH: 0.05, slitW: 0.24 };
export const METAL_COST = 25;   // the metalwork bench itself, once the boards are braced all the way (BRACE.max)
export const METAL_AID = 6;   // the Scrap metal aid card after a wave (upgrades/upgrades.js): two grates' worth
export const METAL_DROP = 0.72;   // metal drops a little less often than planks (zombies/damage.js: the planks roll is 0.6 to 0.75)
const grateHp = () => 3 * BOARD_HP * braceMul(BRACE.max) * GRATE.over * S.boardMul * (1 + GRATE.tierHp * METAL.tier);
const GRATE_PLACE = 0.7, GRATE_BOLTS = [0.45, 0.66, 0.86];

// ---- the look: a cage of ribbed rebar between flat bar on the inside face, steel plate on the outside
const PLATE_TEX = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#d2d6da'; x.fillRect(0, 0, 128, 64);
  for (let k = 0; k < 900; k++) { const v = (rand() * 40 - 20) | 0; x.fillStyle = `rgba(${170 + v},${176 + v},${182 + v},.4)`; x.fillRect(rand() * 128, rand() * 64, 1 + rand() * 2, 1); }   // mill scale
  for (let k = 0; k < 14; k++) { x.strokeStyle = `rgba(230,236,240,${0.08 + rand() * 0.12})`; x.lineWidth = 0.6; const sx = rand() * 128, sy = rand() * 64, a = rr(-0.5, 0.5), L = rr(8, 30); x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L); x.stroke(); }   // scratches
  for (let k = 0; k < 6; k++) { const sx = rand() * 128, g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(120,64,30,.0)'); g.addColorStop(1, `rgba(120,64,30,${0.15 + rand() * 0.2})`); x.fillStyle = g; x.fillRect(sx, 20 + rand() * 20, 2 + rand() * 4, 44); }   // rust run down from the bottom
  x.strokeStyle = 'rgba(40,40,44,.45)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, 125, 61);   // darker edges
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
})();
const GR_M = { frame: lam(0x3b3e42), strap: lam(0x4c4f53), rebar: lam(0x6a4f3c), rivet: lam(0x2c2e31), weld: lam(0x3a3430) };
const GR_PLATE = [0xb4bbc2, 0xa9b1b8, 0xbcc0c3, 0xa4abb1];
const REBAR_GEO = new Map();
// a length of ribbed rebar standing up from y 0 to L (a lathe: the ribs every 14 mm)
function rebarGeo(L) {
  const key = L.toFixed(3); if (REBAR_GEO.has(key)) return REBAR_GEO.get(key);
  const pts = [new THREE.Vector2(0, 0)], n = Math.max(4, Math.round(L / 0.014));
  for (let q = 0; q <= n; q++) pts.push(new THREE.Vector2(q % 2 ? 0.0122 : 0.0098, q / n * L));
  pts.push(new THREE.Vector2(0, L));
  const g = new THREE.LatheGeometry(pts, 7); REBAR_GEO.set(key, g); return g;
}
// where the grate sits in its opening (bg's frame: x along the wall, y up, z out of it by o.out): the window's frame from
// sill to head, a door's from the step to the lintel
const grateSpan = o => o.kind === 'door' ? { x: 0.47, y0: 0.03, y1: 2.08 } : { x: 0.46, y0: 1.0, y1: 1.9 };
// a little seeded shuffle, the same on every screen for the same opening and tier, so the plates come away and the
// bars give in the same order everywhere in co-op
function grRng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function shuffled(n, rng) { const a = Array.from({ length: n }, (_, k) => k); for (let k = n - 1; k > 0; k--) { const j = (rng() * (k + 1)) | 0; [a[k], a[j]] = [a[j], a[k]]; } return a; }
// face: which side of the opening it's bolted up on (1 outside, -1 in, as openSide counts), whoever put it up stood
// there: the whole thing sits on that face, its plate always toward the outside of its bars, so from outside it's
// plate in front of bars and from in the house bars in front of plate
function buildGrate(o, tier, face = 1) {
  const { x: W, y0, y1 } = grateSpan(o), H = y1 - y0, out = o.out, zi = face > 0 ? 0.532 * out : -0.575 * out, zo = 0.548 * out * (face > 0 ? 1 : -1);
  const g = new THREE.Group(), G = { g, tier, face, plates: [], bars: [], straps: [], jolt: 0, disp: 1, shut: false, push: -1, place: 1, t: 0, y0, y1 };
  const rng = grRng(openings.indexOf(o) * 977 + tier * 131 + 7);
  // the inside frame: flat bar round the edge, bolted into the jambs, and the welds
  const fr = new THREE.Group(); g.add(fr);
  box(fr, W * 2, 0.045, 0.012, GR_M.frame, 0, y0 + 0.022, zi); box(fr, W * 2, 0.045, 0.012, GR_M.frame, 0, y1 - 0.022, zi);
  [-1, 1].forEach(s => { box(fr, 0.045, H, 0.012, GR_M.frame, s * (W - 0.022), (y0 + y1) / 2, zi); [y0 + 0.06, y1 - 0.06, (y0 + y1) / 2].forEach(y => ycyl(fr, 0.012, 0.012, 0.012, GR_M.rivet, s * (W - 0.022), y, zi - out * 0.008, 8).rotation.x = Math.PI / 2); });
  // the outside frame the plate is bolted to: angle iron up each jamb and across the head and sill
  [-1, 1].forEach(s => { box(fr, 0.04, H, 0.01, GR_M.frame, s * (W + 0.01), (y0 + y1) / 2, zo); box(fr, 0.01, H, 0.035, GR_M.frame, s * (W + 0.03), (y0 + y1) / 2, zo - out * 0.015); });
  box(fr, W * 2 + 0.06, 0.035, 0.01, GR_M.frame, 0, y0 + 0.018, zo); box(fr, W * 2 + 0.06, 0.035, 0.01, GR_M.frame, 0, y1 - 0.018, zo);
  mergeInto(fr, fr.children.slice());
  // the rebar: each bar welded top and bottom, in two halves meeting at its middle, so a bar beaten in kinks there
  const nb = 7, half = (H - 0.05) / 2, rg = rebarGeo(half), barTh = shuffled(nb, rng);
  for (let k = 0; k < nb; k++) {
    const bx = (k - (nb - 1) / 2) * (W * 2 - 0.12) / (nb - 1), z = zi - out * 0.004;
    const lo = new THREE.Group(); lo.position.set(bx, y0 + 0.025, z); g.add(lo);
    const hi = new THREE.Group(); hi.position.set(bx, y1 - 0.025, z); g.add(hi);
    const a = new THREE.Mesh(rg, GR_M.rebar); a.castShadow = true; lo.add(a);
    const b = new THREE.Mesh(rg, GR_M.rebar); b.castShadow = true; b.rotation.x = Math.PI; hi.add(b);   // (turned over: hanging down from the head)
    lo.rotation.y = hi.rotation.y = rng() * 6;
    G.bars.push({ lo, hi, half, th: 0.06 + 0.3 * barTh[k] / (nb - 1), on: true, ph: rng() * 6 });
  }
  // flat straps across the bars on the room side, welded at each crossing
  const ns = o.kind === 'door' ? 5 : 3, stTh = shuffled(ns, rng);
  for (let k = 0; k < ns; k++) {
    const sy = y0 + H * (k + 1) / (ns + 1), sp = new THREE.Group(); sp.position.set(-W + 0.03, sy, zi + out * 0.009); g.add(sp);   // (between the bars and the plate)
    box(sp, W * 2 - 0.06, 0.034, 0.008, GR_M.strap, W - 0.03, 0, 0);
    G.straps.push({ g: sp, th: 0.05 + 0.16 * stTh[k] / Math.max(1, ns - 1), on: true });
  }
  // the plate: tier rows of it, from the sill up, each its own sheet with rivets along its top and bottom; the row at
  // chest height left with a firing slit through it (GRATE.slit*). Each hangs, once it's worked loose, from the bolt
  // in one top corner, so its group stands at that corner
  const rows = GRATE.rows, rh = H / rows, slitRow = clamp(Math.floor((GRATE.slitY - y0) / rh), 0, rows - 1), cover = Math.min(rows, tier), fall = shuffled(cover, rng);
  for (let r = 0; r < cover; r++) {
    const side = rng() < 0.5 ? -1 : 1, top = y0 + (r + 1) * rh + 0.006, z = zo + out * (0.012 + r * 0.0025);
    const pg = new THREE.Group(); pg.position.set(side * W, top, z); g.add(pg);
    const mat = lam(GR_PLATE[(rng() * GR_PLATE.length) | 0], { map: PLATE_TEX }), hh = rh + 0.012, cx = -side * W;   // (the sheet's middle, from the corner)
    const sheet = (x0, x1, ya, yb) => { const m = box(pg, x1 - x0, yb - ya, 0.006, mat, cx + (x0 + x1) / 2, -hh + (ya + yb) / 2, 0); m.rotation.z = (rng() - 0.5) * 0.006; return m; };
    if (r === slitRow) {
      const sw = GRATE.slitW, sm = GRATE.slitY - (top - hh), s0 = sm - GRATE.slitH / 2, s1 = sm + GRATE.slitH / 2;
      sheet(-W, -sw, 0, hh); sheet(sw, W, 0, hh); sheet(-sw, sw, 0, s0); sheet(-sw, sw, s1, hh);
      [s0, s1].forEach(y => box(pg, sw * 2 + 0.02, 0.01, 0.022, GR_M.frame, cx, -hh + y + (y === s0 ? -0.005 : 0.005), out * 0.008));   // the slit's lips, bent out
    } else sheet(-W, W, 0, hh);
    const riv = [];
    for (let q = 0; q < 5; q++) [0.022, hh - 0.022].forEach(y => { const m = ycyl(pg, 0.009, 0.011, 0.008, GR_M.rivet, cx + (q - 2) * (W * 2 - 0.08) / 4, -hh + y, out * 0.006, 8); m.rotation.x = Math.PI / 2; riv.push(m); });
    mergeInto(pg, riv);
    G.plates.push({ g: pg, side, th: 0.84 - 0.4 * fall[r] / Math.max(1, cover - 1), on: true, ph: rng() * 6, z0: z, inT: 1 });   // (the first starts working loose at 0.96)
  }
  G.shut = G.plates.length >= 3;
  g.userData.place = 1;   // (the boards' own placing, lighting/day-night.js, leaves it alone)
  return G;
}
// a grate bolted up across o: hp and sd as addBoard's (a teammate's grate: how strong, which side they stood), h0 what
// it went up out of (its full strength, for how worn it looks)
export function addGrate(o, hp, sd, h0) {
  if (o.boards.length) return;
  const mine = hp === undefined;
  o.boards.push(mine ? grateHp() : hp);
  const side = sd || Math.sign((P.x - o.x) * o.nx + (P.z - o.z) * o.nz) || 1;
  const G = buildGrate(o, METAL.tier, side); G.hp0 = h0 || (mine ? o.boards[0] : Math.max(hp, grateHp())); G.disp = o.boards[0] / G.hp0;
  G.place = 0; G.side = o.out * side;
  o.grate = G; o.bg.add(G.g); o.meshes.push(G.g); grateStep(o, 0);
  if (mine) { run.boards++; runStat('grates'); }
  const clank = () => mine ? SFX.clang(0.55) : soundAt(o.x, o.z, () => SFX.clang(0.55));
  GRATE_BOLTS.forEach(k => setTimeout(clank, k * GRATE_PLACE * 1000));
  burst(o.x + o.nx * side * .55, (G.y0 + G.y1) / 2, o.z + o.nz * side * .55, 4, 'dust');
  setFlowDirty(true); setLightsDirty(true);
}
// the plating changed (a tier bought): every grate is taken down and put back up with its new plate, made good, the
// sheets swinging in one after another
export function regrate(o) {
  const G0 = o.grate; if (!G0) return;
  const h0 = G0.hp0 * (1 + GRATE.tierHp * METAL.tier) / (1 + GRATE.tierHp * G0.tier);
  o.bg.remove(G0.g); o.meshes.length = 0;
  const G = buildGrate(o, METAL.tier, G0.face); G.hp0 = h0; o.boards[0] = h0; G.disp = 1;
  G.plates.forEach((p, k) => { p.inT = -k * 0.16; });
  o.grate = G; o.bg.add(G.g); o.meshes.push(G.g); grateStep(o, 0);
  setLightsDirty(true);
}
// ---- wear: every frame, the grate as beaten as its hp says (eased, so a joiner's steps between the host's word on it
// don't jump): plate by plate it's worked loose, hangs from its top bolt and swings down, then drops off; with the
// plate gone the bars are beaten in, kinking at their middles, till they snap off their welds and fall; the straps go
// last. A blow shakes the lot
export function grateStep(o, dt) {
  const G = o.grate; if (!G) return;
  G.t += dt; G.disp += (clamp(o.boards[0] / (G.hp0 || 1), 0, 1) - G.disp) * Math.min(1, dt * 6 || 1);
  const d = G.disp, j = G.jolt = Math.max(0, G.jolt - dt * 3.4), shk = Math.sin(G.t * 47) * j;
  // going up: the cage swung in from your side and eased onto the frame, settling as each bolt goes home
  if (G.place < 1) {
    G.place = Math.min(1, G.place + dt / GRATE_PLACE); const a = 1 - Math.pow(1 - G.place, 3), b = 1 - a;
    let knock = 0; for (const n of GRATE_BOLTS) { const e = (G.place - n) / 0.1; if (e > 0 && e < 1) knock += Math.sin(e * Math.PI) * (1 - e); }
    G.g.position.set(0, -b * 0.12, G.side * (b * 0.35 - knock * 0.01)); G.g.rotation.x = -b * 0.12 * G.side;
  } else { G.g.position.set(shk * 0.006, 0, 0); G.g.rotation.x = 0; }
  let held = 0;
  for (const p of G.plates) {
    if (!p.on) continue;
    if (d < p.th) { plateOff(o, p); continue; }
    held++;
    const loose = smooth(clamp((p.th + 0.12 - d) / 0.12, 0, 1));
    if (p.inT < 1) p.inT = Math.min(1, p.inT + dt * 3.2);
    const k = clamp(p.inT, 0, 1), sl = 1 - (1 - Math.pow(1 - k, 3));
    // hanging from its bolt, the free corner dropping and the sheet standing off the frame, rattling when hit
    p.g.rotation.z = p.side * (0.42 * loose + Math.sin(G.t * 31 + p.ph) * j * (0.015 + 0.05 * loose));
    p.g.position.z = p.z0 + o.out * (0.03 * loose + sl * 0.08);
    p.g.position.y = p.g.userData.y0 === undefined ? (p.g.userData.y0 = p.g.position.y) : p.g.userData.y0 + sl * 0.3;
    p.g.visible = p.inT > 0;
  }
  const shut = held >= 3; if (shut !== G.shut) { G.shut = shut; setLightsDirty(true); }
  for (const b of G.bars) {
    if (!b.on) continue;
    if (d < b.th) { barOff(o, b); continue; }
    // beaten in from the side it's struck from (G.push), the two halves kinking at the middle
    const bend = smooth(clamp((b.th + 0.15 - d) / 0.15, 0, 1)) * 0.3 + Math.sin(G.t * 39 + b.ph) * j * 0.012, s = G.push * o.out;
    b.lo.rotation.x = s * bend; b.hi.rotation.x = -s * bend;
  }
  for (const s of G.straps) {
    if (!s.on) continue;
    if (d < s.th) { strapOff(o, s); continue; }
    s.g.rotation.z = -0.35 * smooth(clamp((s.th + 0.08 - d) / 0.08, 0, 1)) + Math.sin(G.t * 43) * j * 0.01;   // (sagging from its far weld)
  }
}
// pieces of grate on the ground: steel that clangs where it lands (weapons/casings.js's debris), a while, then gone
export const looseMetal = [];
function metalOff(m, o, kind, r, lay, f) {
  m.updateMatrixWorld(true); const wp = new V3(), wq = new THREE.Quaternion(); m.getWorldPosition(wp); m.getWorldQuaternion(wq);
  if (m.parent) m.parent.remove(m); m.rotation.order = 'YXZ'; m.position.copy(wp); m.quaternion.copy(wq); scene.add(m);
  const sd = -(o.grate ? o.grate.push : 1), ox = o.nx * sd, oz = o.nz * sd, k = f || 1;
  looseMetal.push({ g: m, life: 30, vx: ox * rr(0.4, 1.4) * k + rr(-0.4, 0.4), vy: rr(0.2, 1.2) * k, vz: oz * rr(0.4, 1.4) * k + rr(-0.4, 0.4), spin: rr(-4, 4) * k, roll: rr(-4, 4) * k, r, bounces: 0, kind, restY: r, rest: lay });
  while (looseMetal.length > 60) { const q = looseMetal.shift(); scene.remove(q.g); }
}
const layFlat = q => q.rotation.set(Math.PI / 2, rr(0, 6.3), 0), layBar = q => q.rotation.set(0, rr(0, 6.3), Math.PI / 2);
function plateOff(o, p) {
  p.on = false; metalOff(p.g, o, 'plate', 0.012, layFlat);
  if (visAt(o.x, o.z) > 0.15) { const w = p.g.position; sparkBurst(w.x, w.y, w.z, 6, o.nx, o.nz, 1.6); burst(w.x, w.y, w.z, 3, 'dust'); }
  soundAt(o.x, o.z, () => SFX.clang(0.8));
}
function barOff(o, b) {
  b.on = false; metalOff(b.lo, o, 'bar', 0.012, layBar); metalOff(b.hi, o, 'bar', 0.012, layBar);
  if (visAt(o.x, o.z) > 0.15) { const w = b.lo.position; sparkBurst(w.x, w.y + b.half, w.z, 8, o.nx * o.grate.push, o.nz * o.grate.push, 2); }
  soundAt(o.x, o.z, () => SFX.snapMetal());
}
function strapOff(o, s) { s.on = false; metalOff(s.g, o, 'bar', 0.006, layFlat); soundAt(o.x, o.z, () => SFX.clang(0.5)); }
// a blow on the grate (boardJolt): the lot shakes in its bolts, sparks and flakes of paint and rust fly off where it
// landed, and it rings; a brute's (big) twice as hard
export function grateJolt(o, z, big) {
  const G = o.grate; if (!G) return;
  G.jolt = Math.min(1.4, G.jolt + (big ? 1.1 : 0.7));
  if (!z) return;
  const sd = openSide(o, z.x, z.z); G.push = -sd;
  const along = rr(-0.38, 0.38), ax = o.axis === 'x' ? along : 0, az = o.axis === 'x' ? 0 : -along, y = rr(G.y0 + 0.12, Math.min(G.y1 - 0.08, G.y0 + 1.5));
  const x = o.x + o.nx * sd * 0.57 + ax, zz = o.z + o.nz * sd * 0.57 + az;
  if (z.vis === undefined || z.vis > 0.2) {
    sparkBurst(x, y, zz, (big ? 9 : 3) + ((rand() * 3) | 0), o.nx * sd, o.nz * sd, big ? 2.6 : 1.8);
    fx('debris', x, y, zz, o.nx * sd * rr(0.6, 1.4), rr(0.2, 0.8), o.nz * sd * rr(0.6, 1.4), 0.06, rr(0.25, 0.4), rr(0.3, 0.45), 0.7);
    if (G.plates.some(p => p.on)) for (let k = 0; k < (big ? 3 : 1); k++) flake(x, y, zz, o.nx * sd, o.nz * sd);
    else if (rand() < 0.5) burst(x, y, zz, 2, 'dust', o.nx * sd, o.nz * sd, 0.8);   // rust shaken off the bare bars
  }
  soundAt(o.x, o.z, () => SFX.clang(big ? 1 : 0.6), true);
}
// a flake of paint or rust knocked off a plate, fluttering down
const FLAKE_GEO = new THREE.BoxGeometry(1, 1, 1), FLAKE_M = [lam(0x8e8a80), lam(0x7a4a2c), lam(0x9aa0a6)];
function flake(x, y, z, dx, dz) {
  const m = new THREE.Mesh(FLAKE_GEO, FLAKE_M[(rand() * FLAKE_M.length) | 0]); m.scale.set(rr(0.015, 0.035), rr(0.012, 0.03), 0.003); m.position.set(x, y, z); scene.add(m);
  looseMetal.push({ g: m, life: rr(5, 9), vx: dx * rr(0.6, 1.6) + rr(-0.5, 0.5), vy: rr(0.4, 1.4), vz: dz * rr(0.6, 1.6) + rr(-0.5, 0.5), spin: rr(-12, 12), roll: rr(-12, 12), r: 0.003, bounces: 0, kind: 'flake', restY: 0.003, rest: layFlat });
  while (looseMetal.length > 60) { const q = looseMetal.shift(); scene.remove(q.g); }
}
// the grate torn out (breakBoard): what's left of it thrown toward whoever broke it, sparks everywhere, a crash of steel
export function breakGrate(o, z) {
  const G = o.grate; o.boards.pop(); o.meshes.pop(); if (!G) return;
  const sd = z ? openSide(o, z.x, z.z) : -openSide(o, P.x, P.z); G.push = -sd;   // (metalOff throws it the other way to the push: toward sd)
  G.plates.forEach(p => { if (p.on) { p.on = false; metalOff(p.g, o, 'plate', 0.012, layFlat, 1.8); } });
  G.bars.forEach(b => { if (b.on) { b.on = false; metalOff(b.lo, o, 'bar', 0.012, layBar, 1.6); metalOff(b.hi, o, 'bar', 0.012, layBar, 1.6); } });
  G.straps.forEach(s => { if (s.on) { s.on = false; metalOff(s.g, o, 'bar', 0.006, layFlat, 1.6); } });
  o.bg.remove(G.g); o.grate = null;
  const x = o.x + o.nx * sd * 0.5, zz = o.z + o.nz * sd * 0.5, y = (G.y0 + G.y1) / 2;
  sparkBurst(x, y, zz, 22, o.nx * sd, o.nz * sd, 3); burst(x, y, zz, 8, 'dust', o.nx * sd, o.nz * sd, 2);
  soundAt(o.x, o.z, () => { SFX.snapMetal(); SFX.clang(1.2); }); setTimeout(() => soundAt(o.x, o.z, () => SFX.clang(0.9)), 90);
  setFlowDirty(true); setLightsDirty(true);
}

// ---- the bench: the sawhorse made over into a metalwork bench. METAL is the team's (every window, every teammate's
// screen): on once anyone's built it, tier how much plate the grates carry
export function forgeMetal() {
  applyMetal(true, 0, true); netMetal();
  feed('metal', 0, 'Metalwork bench built');
  gotGear({ ic: 'metal', kind: 'Sawhorse', name: 'Metalwork bench', text: `Bar windows and doors with steel grates, ${GRATE.cost} metal each. Tear the boards down first.` });
}
// on: whether there's a metalwork bench; tier: the grates' plating; fx: the bench changes in a cloud of smoke here.
// The boards already up stay up (tear them down to bar the opening instead); the planks you carry are no use now and
// gone, so you start on metal from nothing; the grates up are rebuilt for the new plate
export function applyMetal(on, tier, fx) {
  const was = METAL.on, t0 = METAL.tier;
  METAL.on = on; METAL.tier = on ? tier : 0;
  if (on !== was) { benchLook(on, fx); metalIcons(on); }
  if (!on) return;
  if (!was) { S.planks = 0; popEl('planks'); }
  if (tier !== t0) for (const o of openings) if (o.grate) regrate(o);
}
// the sawhorse's model or the bench's: the swap made under a cloud of smoke (fx), the hammering and grinding heard
// through it; the bench's model is only built the first time it's wanted
function benchLook(on, fx) {
  const s = STATIONS.find(q => q.id === 'saw'); if (!s) return;
  const swap = () => {
    if (on && !s.metal) { s.metal = metalBenchModel(); s.g.add(s.metal); }
    if (s.metal) s.metal.visible = on; s.wood.visible = !on;
    s.name = on ? 'Metalwork bench' : 'Sawhorse';
    if (s.g.userData.ol) s.g.userData.ol.rad = 0;   // (its outline's measured again: effects/screen-outlines.js)
  };
  if (!fx) { swap(); return; }
  const p = s.g.position;
  for (let k = 0; k < 4; k++) setTimeout(() => { burst(p.x + rr(-0.5, 0.5), 0.4, p.z + rr(-0.25, 0.25), 9, 'smoke'); burst(p.x, 0.8, p.z, 4, 'dust'); }, k * 120);
  setTimeout(() => { swap(); sparkBurst(p.x, 0.95, p.z, 18, 0, -1, 2); SFX.clang(1); }, 200);
  [320, 520, 700].forEach(t => setTimeout(() => SFX.clang(0.7), t)); setTimeout(() => SFX.snapMetal(), 860);
}
// every planks icon on the screen (yours, a teammate's in the list) the I-beam once it's metal
function metalIcons(on) {
  document.querySelectorAll('svg[data-gi="planks"]').forEach(s => { s.innerHTML = on ? GI.metal : GI.planks; if (s.parentElement) s.parentElement.title = on ? 'Metal' : 'Planks'; });
}
// what you carry to bar the openings with, by name and by icon
export const matWord = () => METAL.on ? 'metal' : 'planks', matKind = () => METAL.on ? 'metal' : 'planks';
// ---- the metalwork bench: a fabrication bench as a farm shop has one, built from what it's for. A thick steel top,
// worn bright in the middle and flecked with weld spatter, on square-tube legs with rails round the top and the
// bottom; a steel shelf under it with a MIG welder on it, its gun and lead hung up on the leg, and lengths of tube
// and flat bar. A cast-iron vise bolted to the front corner, F-clamps hung off the front edge, an angle grinder and a
// chipping hammer on the top; and the gas bottle chained to the end, its regulator's hose run down it and along the
// shelf to the welder
function metalBenchModel() {
  const g = new THREE.Group(), sil = m => { m.userData.sil = true; return m; };
  const plate = lam(0x575b5f), worn = lam(0x75797d), tube = lam(0x303336), shelf = lam(0x3e4144), iron = lam(0x3a3e42), jaw = lam(0x24272a), steel = lam(0x8d9296), black = lam(0x1f2022), spat = lam(0x2a2826);
  const W = 1.76, D = 0.6, TOP = 0.86;
  // the top: a 20 mm plate, its edge darker, worn bright where the work's done, weld spatter about
  sil(box(g, W, 0.025, D, plate, 0, TOP + 0.0125, 0)); box(g, W + 0.004, 0.012, D + 0.004, tube, 0, TOP + 0.004, 0);
  box(g, 0.7, 0.001, 0.32, worn, -0.15, TOP + 0.0255, 0.02);
  { const r = grRng(31); for (let k = 0; k < 26; k++) { const m = ycyl(g, 0.004, 0.005, 0.002, spat, -0.45 + r() * 0.65, TOP + 0.026, -0.14 + r() * 0.3, 6); m.scale.setScalar(0.6 + r()); } }
  // the frame: 50 mm square tube legs on foot plates, a rail round under the top and another low down
  const lx = W / 2 - 0.06, lz = D / 2 - 0.05;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { sil(box(g, 0.05, TOP - 0.01, 0.05, tube, sx * lx, (TOP - 0.01) / 2, sz * lz)); box(g, 0.09, 0.008, 0.09, tube, sx * lx, 0.004, sz * lz); });
  [TOP - 0.035, 0.2].forEach(y => { [-1, 1].forEach(sz => box(g, lx * 2, 0.04, 0.04, tube, 0, y, sz * lz)); [-1, 1].forEach(sx => box(g, 0.04, 0.04, lz * 2, tube, sx * lx, y, 0)); });
  sil(box(g, lx * 2 - 0.04, 0.006, lz * 2 - 0.02, shelf, 0, 0.223, 0));   // the shelf, a sheet on the low rails
  // the MIG welder on the shelf: its case, the front panel with two knobs, the gun's socket and the vents; the wire
  // spool's door on the side
  const wd = new THREE.Group(); wd.position.set(-0.45, 0.226, 0.02); g.add(wd);
  const caseM = lam(0x355a7e), panel = lam(0x22282e);
  sil(box(wd, 0.46, 0.28, 0.24, caseM, 0, 0.14, 0)); box(wd, 0.4, 0.2, 0.004, panel, 0.0, 0.15, -0.122);
  [-0.12, 0.0].forEach(x => { ycyl(wd, 0.022, 0.022, 0.016, black, x, 0.2, -0.13, 14).rotation.x = Math.PI / 2; box(wd, 0.004, 0.012, 0.004, steel, x, 0.212, -0.139); });
  ycyl(wd, 0.016, 0.016, 0.02, lam(0x9a8a5a), 0.12, 0.12, -0.132, 12).rotation.x = Math.PI / 2;   // the euro socket
  for (let k = 0; k < 5; k++) box(wd, 0.004, 0.09, 0.002, panel, -0.17 + k * 0.012, 0.09, -0.123);   // vents
  box(wd, 0.002, 0.2, 0.16, lam(0x2f5070), 0.231, 0.15, 0.0); box(wd, 0.006, 0.03, 0.012, black, 0.234, 0.15, -0.06);   // the spool door and its catch
  box(wd, 0.36, 0.02, 0.03, black, 0, 0.29, 0);   // the carry handle
  // its gun and lead coiled over a hook on the front leg, and its earth clamp hung beside it
  const ld = new THREE.Group(); ld.position.set(-lx - 0.028, 0.6, -lz); g.add(ld);
  [0, 1, 2].forEach(k => { const t = torus(ld, 0.11 - k * 0.006, 0.009, black, 0, -0.02 * k, 0.0); t.rotation.y = Math.PI / 2; t.scale.set(1, 1.25, 1); });
  box(ld, 0.03, 0.03, 0.016, black, 0, 0.13, 0);   // the hook
  const gun = new THREE.Group(); gun.position.set(-0.012, -0.12, 0.07); gun.rotation.x = 0.4; ld.add(gun);
  ycyl(gun, 0.016, 0.016, 0.14, black, 0, 0, 0, 10); ycyl(gun, 0.011, 0.014, 0.07, lam(0x9a7a3a), 0, -0.1, 0, 10); box(gun, 0.012, 0.03, 0.018, lam(0x7a1a14), 0, 0.02, -0.018);   // handle, brass nozzle, trigger
  // the vise bolted to the right front corner: base, body, the two jaws with their hardened plates, the slide and the
  // screw out the front with its T-bar
  const vs = new THREE.Group(); vs.position.set(0.66, TOP + 0.025, -0.2); g.add(vs);
  ycyl(vs, 0.075, 0.08, 0.025, iron, 0, 0.0125, 0.04, 18); sil(box(vs, 0.11, 0.08, 0.2, iron, 0, 0.065, 0.04));
  box(vs, 0.15, 0.075, 0.045, iron, 0, 0.12, 0.13); box(vs, 0.15, 0.075, 0.045, iron, 0, 0.12, 0.035);
  box(vs, 0.14, 0.05, 0.006, jaw, 0, 0.13, 0.106); box(vs, 0.14, 0.05, 0.006, jaw, 0, 0.13, 0.059);
  box(vs, 0.07, 0.05, 0.12, iron, 0, 0.075, -0.03); zcyl(vs, 0.012, 0.16, steel, 0, 0.075, -0.1); xcyl(vs, 0.007, 0.2, steel, 0, 0.075, -0.18);
  [-0.1, 0.1].forEach(x => ycyl(vs, 0.011, 0.011, 0.012, steel, x, 0.075, -0.18, 8).rotation.z = Math.PI / 2);
  [-0.05, 0.05].forEach(x => ycyl(vs, 0.008, 0.008, 0.008, steel, x, 0.004, 0.11, 6));   // its bolts
  // F-clamps hung off the front edge of the top
  [-0.72, -0.62, -0.53].forEach((x, k) => {
    const c = new THREE.Group(); c.position.set(x, TOP + 0.026, -D / 2 - 0.012); c.rotation.z = (k - 1) * 0.04; g.add(c);
    box(c, 0.014, 0.3 - k * 0.04, 0.006, steel, 0, -(0.3 - k * 0.04) / 2 + 0.03, 0);   // the bar
    box(c, 0.05, 0.016, 0.03, iron, 0.018, 0.02, 0.012); box(c, 0.05, 0.016, 0.03, iron, 0.018, -(0.26 - k * 0.04), 0.012);   // the jaws
    ycyl(c, 0.012, 0.012, 0.07, lam(0x7a3a24), 0.04, -(0.26 - k * 0.04) - 0.04, 0.012, 8);   // the wooden handle
  });
  // on the top: the angle grinder with its disc and guard, a chipping hammer, offcuts
  const ag = new THREE.Group(); ag.position.set(0.12, TOP + 0.05, 0.12); ag.rotation.y = -0.5; g.add(ag);
  xcyl(ag, 0.03, 0.26, black, 0, 0, 0, 12); xcyl(ag, 0.034, 0.05, lam(0x4a4c4e), 0.15, 0.004, 0, 12);
  ycyl(ag, 0.058, 0.058, 0.003, lam(0x6a5a48), 0.18, -0.03, 0, 18); const gd = ycyl(ag, 0.064, 0.064, 0.012, steel, 0.18, -0.018, 0, 18, true); gd.scale.set(1, 1, 1);
  xcyl(ag, 0.012, 0.09, black, 0.17, 0.012, 0.07, 8).rotation.y = Math.PI / 2;   // the side handle
  const ch = new THREE.Group(); ch.position.set(-0.05, TOP + 0.04, -0.14); ch.rotation.y = 0.9; g.add(ch);
  xcyl(ch, 0.011, 0.24, lam(0x7a3a24), 0, 0, 0, 8); box(ch, 0.016, 0.016, 0.16, steel, 0.12, 0, 0);   // the chipping hammer
  box(g, 0.32, 0.03, 0.03, steel, -0.2, TOP + 0.04, -0.08).rotation.y = 0.15; box(g, 0.2, 0.008, 0.05, worn, 0.36, TOP + 0.03, 0.18).rotation.y = -0.3;
  // stock on the shelf: lengths of square tube and flat bar, and a stack of plate offcuts
  [[0.0, 0.25, 0.09, 1.2], [0.03, 0.25, 0.14, 1.05]].forEach(([y, x, z, L]) => box(g, L * 0.5, 0.03, 0.03, tube, x, 0.24 + y, z));
  box(g, 0.6, 0.006, 0.05, steel, 0.32, 0.229, -0.12); box(g, 0.5, 0.006, 0.04, steel, 0.3, 0.235, -0.07).rotation.y = 0.05;
  [0, 1, 2].forEach(k => box(g, 0.24 - k * 0.03, 0.008, 0.18 - k * 0.02, k % 2 ? worn : plate, 0.62, 0.23 + k * 0.008, 0.1).rotation.y = k * 0.2 - 0.2);
  // the gas bottle stood at the end, chained to the leg: grey with its shoulder painted, the valve, the regulator and
  // its two gauges, and the hose down its side and along the shelf to the welder
  const bx = lx + 0.13, bz = lz - 0.02;
  sil(ycyl(g, 0.09, 0.09, 0.82, lam(0x6b6f70), bx, 0.41, bz, 18)); const dm = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x4e6a3e)); dm.position.set(bx, 0.82, bz); dm.castShadow = true; g.add(dm);
  ycyl(g, 0.0905, 0.0905, 0.06, lam(0x4e6a3e), bx, 0.79, bz, 18);
  ycyl(g, 0.022, 0.026, 0.07, lam(0xa88a3c), bx, 0.94, bz, 10); ycyl(g, 0.03, 0.03, 0.015, black, bx, 0.985, bz, 12);
  const rg = new THREE.Group(); rg.position.set(bx, 0.95, bz); g.add(rg);
  xcyl(rg, 0.022, 0.06, lam(0xa88a3c), -0.04, 0, 0, 10);
  [[-0.07, 0.03], [-0.07, -0.03]].forEach(([x, z]) => { const c = ycyl(rg, 0.026, 0.026, 0.016, lam(0x8a8d90), x, 0.02, z, 14); c.rotation.x = Math.PI / 2; ycyl(rg, 0.021, 0.021, 0.002, lam(0xe8e4d8), x, 0.02, z - 0.009, 14).rotation.x = Math.PI / 2; });
  [0.3, 0.6].forEach(y => { const t = torus(g, 0.093, 0.006, steel, bx, y, bz); t.rotation.x = Math.PI / 2; });   // the chain round it
  const hose = new THREE.CatmullRomCurve3([new V3(bx - 0.1, 0.95, bz), new V3(bx - 0.1, 0.8, bz - 0.09), new V3(bx - 0.1, 0.35, bz - 0.095), new V3(lx - 0.02, 0.24, bz - 0.06), new V3(0.2, 0.235, 0.21), new V3(-0.3, 0.27, 0.15)]);
  const hm = new THREE.Mesh(new THREE.TubeGeometry(hose, 24, 0.007, 6), black); hm.castShadow = true; g.add(hm);
  unfight(g); mergeInto(g, finePieces(g));
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
