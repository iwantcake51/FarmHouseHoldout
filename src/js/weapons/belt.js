// A belt-fed gun's belt (the LMG's): a chain of linked rounds, simulated. Each round is a particle (position-based
// dynamics: Verlet steps, then constraints solved a few times over), joined to the next by its link at the belt's
// pitch, a hinge that bends freely in the belt's own plane (the rounds stay pointing forward, along the gun) up to
// where the rounds would touch, with a little stiffness to it, and only a little give fore and aft out of that plane.
// The first round is held in the feed port; the next ride the feed tray under the cover's lip, and the rest hang off
// the tray's edge down into the box, the end of it going on down into the folded stack in there. It's stepped at a
// fixed rate (BELT_SIM.dt) whatever the frame rate, in the gun's own frame, feeling the gun's motion through space as
// its own inertia (player/hold-sway.js: stepBelt) and gravity, and it collides with the box's walls, lip and floor,
// the tray and the receiver's side. Every shot pulls it a link on (beltAdvance): the round in the feed port drawn into
// the gun, the rest following it round over the tray's edge and up out of the box.
//
// Here only the chain and its world; player/hold-sway.js runs it on the gun in your hands, and
// weapons/models-rifles.js lays the model's belt out where it settles (beltRest).

// pitch: link to link (m); r: a round and its links across (for walls), self: the closest two rounds not linked to
// each other come; bend: the tightest the belt folds between three rounds (their ends' distance, m), stiff: how much
// of its straightening is put back each pass; z: give fore and aft, its spring and the most of it; damp: air (per s),
// fric: of the walls, floor and tray; it: passes a step; vmax: the fastest a round goes (m/s, a guard)
export const BELT_SIM = { pitch: 0.0165, r: 0.0095, self: 0.0148, bend: 0.0286, stiff: 0.05, zk: 0.08, zmax: 0.007, damp: 2.2, fric: 0.35, it: 8, dt: 1 / 240, vmax: 2.2, wall: 0.003 };
// the tray: the round in the port sits at (x0, y) (geo); the tray runs on from a pitch inside to its edge (edge, past
// x0), its top and the feed cover's lip over it holding the rounds on it flat as far as cover past x0 (rl: the
// tray's rounded edge)
export const BELT_TRAY = { edge: 0.0185, rl: 0.0105, cover: 0.017 };

// the state of one belt: positions (p), where each was a step before (o, its velocity), and the step before that's
// end (q: drawn between q and p by how far the frame's into the next step)
// (in: which side of the box's walls each is on, 1 inside it, kept from when it was last over the top, so however far
// the gun's motion carries a round in a frame it's never put out through a wall, or in; tr: which are on the tray)
export function beltState(n) { return { n, p: new Float64Array(n * 3), o: new Float64Array(n * 3), q: new Float64Array(n * 3), in: new Uint8Array(n), tr: new Uint8Array(n) }; }

// the box's frame: B (a Matrix4: box to gun, as it's moved in the reload; null where it's seated) and its inverse
const _beV = new THREE.Vector3();
const beltToBox = (B, Bi, a, i) => { if (!B) return; _beV.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(Bi); a[i] = _beV.x; a[i + 1] = _beV.y; a[i + 2] = _beV.z; };
const beltFromBox = (B, a, i) => { if (!B) return; _beV.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(B); a[i] = _beV.x; a[i + 1] = _beV.y; a[i + 2] = _beV.z; };

// pushed out of a capsule (a segment from (ax, ay) to (bx, by), radius R) in the belt's plane; true if it was in it
function beltCap(p, i, ax, ay, bx, by, R) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((p[i] - ax) * dx + (p[i + 1] - ay) * dy) / (dx * dx + dy * dy))), cx = ax + dx * t, cy = ay + dy * t;
  let ex = p[i] - cx, ey = p[i + 1] - cy; const d = Math.hypot(ex, ey); if (d >= R) return false;
  if (d < 1e-7) { ex = 0; ey = 1; } else { ex /= d; ey /= d; }
  p[i] = cx + ex * R; p[i + 1] = cy + ey * R; return true;
}
// its give fore and aft: sprung back toward the belt's plane (z), and only so far off it
const beltZ = (p, i, z0) => { const s = BELT_SIM; p[i + 2] += (z0 - p[i + 2]) * s.zk; p[i + 2] = z0 + Math.max(-s.zmax, Math.min(s.zmax, p[i + 2] - z0)); };
// a wall's friction: what was moving along it is slowed (o drawn toward p)
const beltRub = (S, i, k) => { S.o[i] += (S.p[i] - S.o[i]) * k; S.o[i + 1] += (S.p[i + 1] - S.o[i + 1]) * k; S.o[i + 2] += (S.p[i + 2] - S.o[i + 2]) * k; };

// a link kept off an edge (a circle in the belt's plane: the tray's, the box's lip): where it passes closest to it, both
// its rounds pushed out together (by how near each is to that point), so the belt wraps round an edge rather than a
// link cutting through it with a round either side
function beltEdge(p, i, j, wa, wb, ex, ey, R) {
  const ax = p[i], ay = p[i + 1], dx = p[j] - ax, dy = p[j + 1] - ay, L = dx * dx + dy * dy; if (L < 1e-12) return false;
  const t = Math.max(0, Math.min(1, ((ex - ax) * dx + (ey - ay) * dy) / L)); if (t <= 0 || t >= 1) return false;
  const cx = ax + dx * t, cy = ay + dy * t; let nx = cx - ex, ny = cy - ey; const d = Math.hypot(nx, ny); if (d >= R) return false;
  if (d < 1e-7) { nx = -dy; ny = dx; } const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
  const a = (1 - t) * wa, b = t * wb, sw = (1 - t) * a + t * b; if (sw < 1e-9) return false;
  const m = (R - d) / sw; p[i] += nx * m * a; p[i + 1] += ny * m * a; p[j] += nx * m * b; p[j + 1] += ny * m * b; return true;
}
// the box (in its own frame): inside it, kept off its walls and on the stack folded in it (geo.floor); outside it,
// kept off its outside; over its top, off the lip all round (which side of a wall a round's on: S.in)
function beltBoxHit(S, k, G, B, Bi) {
  const i = k * 3;
  const s = BELT_SIM, p = S.p, r = s.r, w = s.wall, x0 = G.bx0, x1 = G.bx1, top = G.bt;
  beltToBox(B, Bi, p, i); beltToBox(B, Bi, S.o, i);
  if (B) beltZ(p, i, G.z);   // (off the gun, the belt's plane is the box's)
  let hit = false;
  if (p[i + 1] < top && p[i] > x0 - r && p[i] < x1 + r && p[i + 1] > G.bb - r) {
    if (S.in[k]) {
      if (p[i] < x0 + w + r) { p[i] = x0 + w + r; hit = true; }
      if (p[i] > x1 - w - r) { p[i] = x1 - w - r; hit = true; }
      if (p[i + 1] < G.floor) { p[i + 1] = G.floor; hit = true; }
    } else {   // (out to whichever side it's nearer)
      p[i] = p[i] < (x0 + x1) / 2 ? Math.min(p[i], x0 - r) : Math.max(p[i], x1 + r); hit = true;
    }
  }
  // the lip: the walls' tops, rounded
  if (p[i + 1] > top - r * 2) { if (beltCap(p, i, x0 + w / 2, top - 0.02, x0 + w / 2, top, w / 2 + r)) hit = true; if (beltCap(p, i, x1 - w / 2, top - 0.02, x1 - w / 2, top, w / 2 + r)) hit = true; }
  if (p[i + 1] >= top) S.in[k] = p[i] > x0 && p[i] < x1 ? 1 : 0;
  if (hit) beltRub(S, i, s.fric);
  beltFromBox(B, p, i); beltFromBox(B, S.o, i);
}
// the gun: the tray (a rounded plate a round rides over the edge of, onto it or off it) and the cover's lip over it,
// which holds a round that's on the tray flat on it as far as the lip goes (S.tr: which are on it), and (with the box
// on, not off in the hand) the receiver's side, the whole height of the gun under the tray and over it (not where the
// tray comes out of it)
function beltGunHit(S, k, G, side, shut) {
  const i = k * 3, p = S.p, T = BELT_TRAY, s = BELT_SIM, y = G.y, a = G.x0 - s.pitch, e = G.x0 + T.edge;
  let hit = beltCap(p, i, a, y - T.rl, e, y - T.rl, T.rl);
  if (p[i] > a - 0.002 && p[i] < e && p[i + 1] > y - 0.0025) S.tr[k] = 1; else if (p[i] > e + 0.004 || p[i + 1] < y - 0.008) S.tr[k] = 0;
  if (shut && S.tr[k] && p[i] < G.x0 + T.cover) { p[i + 1] = y; hit = true; }   // (between the tray and the cover's lip: flat on the tray; the cover open in a reload, it's free to come off)
  if (side && Math.abs(p[i + 1] - y) > T.rl + 0.001 && p[i] < G.side + s.r && p[i + 1] > G.bb && p[i + 1] < y + 0.06) { p[i] = G.side + s.r; hit = true; }
  if (hit) beltRub(S, i, s.fric * 0.5);
}

// one step (dt) of the belt: nV of its rounds simulated (the rest are gone: fired, or not in this box), with pins:
// feed (where the round in the port is, or null: let go, the cover open in a reload), tail (where its far end comes up
// out of the stack in the box, or null: its end's loose); g: gravity (and the gun's own acceleration) in the gun's frame;
// slide: how far the gun's drawn the belt on into it this step (a shot's pull), every round carried that far along it
// toward the port, so the pull's taken up all along it at once (as a real belt's is), not only by the rounds nearest
// the tray (left to the links alone, a quick pull stretched them there)
const _beG = [0, 0, 0];
export function beltStep(S, G, dt, g, nV, feed, tail, B, Bi, side, slide = 0) {
  const s = BELT_SIM, p = S.p, o = S.o, q = S.q, n = Math.min(nV, S.n), dmp = Math.max(0, 1 - s.damp * dt), vm = s.vmax * dt, z0 = G.z;
  if (n <= 0) return;
  _beG[0] = g[0] * dt * dt; _beG[1] = g[1] * dt * dt; _beG[2] = g[2] * dt * dt;
  for (let k = 0; k < n; k++) {
    const i = k * 3;
    let vx = (p[i] - o[i]) * dmp, vy = (p[i + 1] - o[i + 1]) * dmp, vz = (p[i + 2] - o[i + 2]) * dmp; const v = Math.hypot(vx, vy, vz); if (v > vm) { vx *= vm / v; vy *= vm / v; vz *= vm / v; }
    q[i] = p[i]; q[i + 1] = p[i + 1]; q[i + 2] = p[i + 2]; o[i] = p[i]; o[i + 1] = p[i + 1]; o[i + 2] = p[i + 2];
    p[i] += vx + _beG[0]; p[i + 1] += vy + _beG[1]; p[i + 2] += vz + _beG[2];
  }
  const pin = (k, at) => { const i = k * 3; p[i] = at[0]; p[i + 1] = at[1]; p[i + 2] = at[2]; };
  const fixed = k => (k === 0 && feed) || (k === n - 1 && tail && n === S.n);
  if (slide > 0) for (let k = 1; k < n; k++) {
    const i = k * 3, j = i - 3; if (fixed(k) || Math.hypot(p[i] - G.x0 - BELT_TRAY.edge, p[i + 1] - G.y) < 0.024) continue;   // (not round the tray's edge, where the links and the edge take it: cut across, they'd go under the tray)
    const dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2], d = Math.hypot(dx, dy, dz) || 1;
    p[i] += dx / d * slide; p[i + 1] += dy / d * slide; p[i + 2] += dz / d * slide; o[i] += dx / d * slide; o[i + 1] += dy / d * slide; o[i + 2] += dz / d * slide;   // (carried, not flung: o with it)
  }
  const P2 = s.pitch, BEND = s.bend, SELF = s.self;
  // the links, there and back (each round as heavy as the next; a pinned one doesn't move)
  const links = () => { for (let pass = 0; pass < 2; pass++) for (let j = 0; j < n - 1; j++) {
    const k = pass ? n - 2 - j : j, i = k * 3, i2 = i + 3, dx = p[i2] - p[i], dy = p[i2 + 1] - p[i + 1], dz = p[i2 + 2] - p[i + 2], d = Math.hypot(dx, dy, dz) || 1e-9, c = (d - P2) / d;
    const wa = fixed(k) ? 0 : 1, wb = fixed(k + 1) ? 0 : 1, sw = wa + wb; if (!sw) continue;
    p[i] += dx * c * wa / sw; p[i + 1] += dy * c * wa / sw; p[i + 2] += dz * c * wa / sw;
    p[i2] -= dx * c * wb / sw; p[i2 + 1] -= dy * c * wb / sw; p[i2 + 2] -= dz * c * wb / sw;
  } };
  for (let it = 0; it < s.it; it++) {
    if (feed) pin(0, feed); if (tail && n === S.n) pin(n - 1, tail);
    links();
    // the hinges: never folded tighter than the rounds allow (BEND), and a little stiffness toward straight
    for (let k = 1; k < n - 1; k++) {
      const a = (k - 1) * 3, b = (k + 1) * 3, dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], d = Math.hypot(dx, dy, dz) || 1e-9;
      const want = d < BEND ? BEND : d + (2 * P2 - d) * s.stiff, c = (d - want) / d, wa = fixed(k - 1) ? 0 : 1, wb = fixed(k + 1) ? 0 : 1, sw = wa + wb; if (!sw || Math.abs(c) < 1e-9) continue;
      p[a] += dx * c * wa / sw; p[a + 1] += dy * c * wa / sw; p[a + 2] += dz * c * wa / sw;
      p[b] -= dx * c * wb / sw; p[b + 1] -= dy * c * wb / sw; p[b + 2] -= dz * c * wb / sw;
    }
    // rounds not linked to each other kept apart (the belt folding over on itself in the box)
    for (let k = 0; k < n - 2; k++) for (let m = k + 2; m < n; m++) {
      const a = k * 3, b = m * 3, dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2]; if (Math.abs(dx) > SELF || Math.abs(dy) > SELF || Math.abs(dz) > SELF) continue;
      const d = Math.hypot(dx, dy, dz) || 1e-9; if (d >= SELF) continue;
      const c = (d - SELF) / d, wa = fixed(k) ? 0 : 1, wb = fixed(m) ? 0 : 1, sw = wa + wb; if (!sw) continue;
      p[a] += dx * c * wa / sw; p[a + 1] += dy * c * wa / sw; p[a + 2] += dz * c * wa / sw; p[b] -= dx * c * wb / sw; p[b + 1] -= dy * c * wb / sw; p[b + 2] -= dz * c * wb / sw;
    }
    // the links round the tray's edge (and, with the box on, its lip)
    for (let k = 0; k < n - 1; k++) {
      const wa = fixed(k) ? 0 : 1, wb = fixed(k + 1) ? 0 : 1, i = k * 3; if (!wa && !wb) continue;
      beltEdge(p, i, i + 3, wa, wb, G.x0 + BELT_TRAY.edge, G.y - BELT_TRAY.rl, BELT_TRAY.rl);
      if (!B) { beltEdge(p, i, i + 3, wa, wb, G.bx0 + s.wall / 2, G.bt, s.wall / 2 + s.r); beltEdge(p, i, i + 3, wa, wb, G.bx1 - s.wall / 2, G.bt, s.wall / 2 + s.r); }
    }
    // its give fore and aft, and the walls
    for (let k = 0; k < n; k++) {
      if (fixed(k)) continue;
      const i = k * 3; if (!B) beltZ(p, i, z0);
      beltGunHit(S, k, G, side, !!feed); beltBoxHit(S, k, G, B, Bi);
    }
  }
  if (feed) pin(0, feed); if (tail && n === S.n) pin(n - 1, tail);
  links(); links();   // (and the links last of all, so what a wall or the tray's edge has just pushed never leaves one long)
  // (the ones gone kept on the last there is, so nothing's left lying about to fly back if they're shown again)
  for (let k = n; k < S.n; k++) { const i = k * 3, j = (n - 1) * 3; for (let c = 0; c < 3; c++) { p[i + c] = o[i + c] = q[i + c] = p[j + c]; } }
}

// a shot: every round moved on to where the one ahead of it was (the one in the port gone into the gun), the far end
// at tail coming up out of the stack (S's arrays shifted down one; what it's drawn as doesn't change: the rounds look
// alike, and the one drawn last is hidden as the belt runs down)
export function beltShift(S, tail) {
  const { p, o, q } = S, N = S.n * 3;
  p.copyWithin(0, 3, N); o.copyWithin(0, 3, N); q.copyWithin(0, 3, N); S.in.copyWithin(0, 1, S.n); S.in[S.n - 1] = 1; S.tr.copyWithin(0, 1, S.n); S.tr[S.n - 1] = 0;
  const i = N - 3; for (let c = 0; c < 3; c++) p[i + c] = o[i + c] = q[i + c] = tail ? tail[c] : p[i - 3 + c];
}

// where a belt settles, hanging off the tray into its box with the gun held level (loose: let go of the tray, all of
// it lying in the box, as a fresh box comes out of the pouch): its rounds' positions, [x, y, z] each
export function beltRest(G, n, loose) {
  const s = BELT_SIM, S = beltState(n), P2 = s.pitch, feed = [G.x0, G.y, G.z], tail = [G.pin[0], G.pin[1], G.z], put = (k, x, y) => { const i = k * 3; S.in[k] = x > G.bx0 && x < G.bx1 && y < G.bt ? 1 : 0; S.p[i] = S.o[i] = S.q[i] = x; S.p[i + 1] = S.o[i + 1] = S.q[i + 1] = y; S.p[i + 2] = S.o[i + 2] = S.q[i + 2] = G.z; };
  // (a first guess for it to settle from: loose, back and forth across the floor in rows from the far end up; else out
  // over the tray, down the box's near side, and along its floor to the far end, any more of it heaped there)
  const x0 = G.bx0 + s.wall + s.r + 0.001, x1 = G.bx1 - s.wall - s.r - 0.001, row = Math.max(2, Math.floor((x1 - x0) / P2) + 1);
  if (loose) for (let k = 0; k < n; k++) { const j = n - 1 - k, r = Math.floor(j / row), c = j % row, x = r % 2 ? x0 + c * P2 : G.pin[0] - c * P2; put(k, Math.max(x0, Math.min(x1, x)), G.floor + r * s.self); }
  else {
    const path = [[G.x0, G.y], [G.x0 + P2, G.y], [x0 + 0.004, G.y - 0.02], [x0 + 0.004, G.floor + 0.004], [G.pin[0], G.floor]];
    const len = []; let L = 0; for (let k = 1; k < path.length; k++) { L += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]); len.push(L); }
    for (let k = 0; k < n; k++) { const u = k / (n - 1) * L; let j = 0; while (j < len.length - 1 && len[j] < u) j++; const a = path[j], b = path[j + 1], l0 = j ? len[j - 1] : 0, t = Math.min(1, (u - l0) / ((len[j] - l0) || 1)); put(k, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); }
  }
  const g = [0, -9.8, 0];
  for (let k = 0; k < 900; k++) beltStep(S, G, s.dt, g, n, loose ? null : feed, loose ? null : tail, null, null, !loose);
  const out = []; for (let k = 0; k < n; k++) out.push([S.p[k * 3], S.p[k * 3 + 1], S.p[k * 3 + 2]]);
  return out;
}
