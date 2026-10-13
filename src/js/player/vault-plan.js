// Vault planning: when a vault starts, the whole move is worked out up front, in the side view of the jump (s along
// the jump from the middle of the obstacle, y up). Each style lays down a path for your hips and target angles for the
// lean and the legs; then every sample is checked against the obstacle's real shape (the fence's rail or post, the
// window's metre-thick wall and the frame over it) and the lean and legs are bent the least they need to clear it,
// the hips lifted if that's not enough. The result is smoothed and checked again, so it plays back clean and steady.

const VB = { hip: 0.6, torso: 0.9, front: 0.16, back: 0.36, leg: 0.56, legR: 0.11 };
const VAULT_N = 48;
// the obstacle in the side view: boxes [s0, y0, s1, y1]
function vaultObstacle(kind, postNear) {
  if (kind === 'window') return [[-0.52, -1, 0.52, 1.04], [-0.52, 1.86, 0.52, 9]];
  return [[-0.07, -1, 0.07, postNear ? 1.12 : 0.82]];
}
// is any part of the body, with its thickness, inside the obstacle or below the ground?
function bodyHits(obs, s, y, lean, legs, partsOnly, twist, which) {
  // with a few centimetres to spare all round: the real body isn't quite this tidy
  // feet may rest on the ground (and a hair below it, in a crouch); the body may not
  const M = 0.045; let floor = 0;
  const inside = (ps, py) => { if (py < floor) return true; for (const b of obs) if (ps > b[0] - M && ps < b[2] + M && py > b[1] - M && py < b[3] + M) return true; return false; };
  if (partsOnly !== 'legs') {
    // torso and head: an axis up from the hip, the belly on the front, the pack on the back
    const ux = Math.sin(lean), uy = Math.cos(lean), fx = Math.cos(lean), fy = -Math.sin(lean);
    for (let k = 0; k <= 6; k++) {
      const a = k / 6 * VB.torso, cs = s + ux * a, cy = y + uy * a, back = a < 0.72 ? VB.back : 0.18;
      if (inside(cs, cy) || inside(cs + fx * VB.front, cy + fy * VB.front) || inside(cs - fx * back, cy - fy * back) || inside(cs - fx * back * 0.5, cy - fy * back * 0.5)) return true;
    }
  }
  floor = -0.08;
  const tw = twist || 0, cl = Math.cos(lean), sl = Math.sin(lean), ct = Math.cos(tw);
  const st = Math.sin(tw);
  if (partsOnly !== 'torso') for (let li = 0; li < legs.length; li++) {
    // a leg: straight down at phi 0, swung back for positive phi (relative to the body, r = phi - lean), with the hips
    // turned by twist; this is its direction in the side view after the body's lean. It hangs from a hip joint 13 cm
    // to its side and 5 cm under the body's pivot, which the twist carries forward or back.
    const phi = legs[li], xo = (legs.length === 2 ? li === 1 : which === 'R') ? 0.13 : -0.13;
    const r = phi - lean, sr = Math.sin(r), cr = Math.cos(r);
    const dy = -cr * cl + sr * ct * sl, dx = -cr * sl - sr * ct * cl, dl = Math.hypot(dx, dy) || 1, px = -dy / dl, py = dx / dl;
    const hs = s - 0.05 * sl - xo * st * cl, hy = y - 0.05 * cl + xo * st * sl;
    for (let k = 1; k <= 5; k++) {
      const a = k / 5 * VB.leg, cs = hs + dx * a, cy = hy + dy * a;
      if (inside(cs, cy) || inside(cs + px * VB.legR, cy + py * VB.legR) || inside(cs - px * VB.legR, cy - py * VB.legR)) return true;
    }
  }
  return false;
}
// the nearest value to want that passes the test, stepping out either way
function nearestClear(want, ok, range) { for (let k = 0; k <= range / 0.04; k++) for (const sg of k ? [1, -1] : [1]) { const v = want + sg * k * 0.04; if (ok(v)) return v; } return null; }
// a smooth curve through keys [t, value], keeping its speed through each key (Catmull-Rom)
function vSpline(keys, t) {
  let k = 0; while (k < keys.length - 2 && keys[k + 1][0] <= t) k++;
  const p0 = keys[Math.max(0, k - 1)], p1 = keys[k], p2 = keys[k + 1], p3 = keys[Math.min(keys.length - 1, k + 2)];
  const h = p2[0] - p1[0] || 1, u = clamp((t - p1[0]) / h, 0, 1);
  const m1 = (p2[1] - p0[1]) / ((p2[0] - p0[0]) || 1) * h, m2 = (p3[1] - p1[1]) / ((p3[0] - p1[0]) || 1) * h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
}
// each style: hip path (s, y), lean, and each leg's angle from straight down (back is positive), all over t 0..1.
// Every curve starts at the crouch and ends standing (the crouch eases into the first sample), so neither the push-off
// nor the landing jumps.
const VAULT_STYLE = {
  // over a fence: a speed vault. A hand on the rail, the hips turn and both legs swing up and over the rail beside
  // each other, then the hips turn back square and the legs come down under you for the landing
  fence: { sAbs: [[0, 0], [0.12, 0.1], [0.25, 0.3], [0.5, 0.85], [0.75, 1.4], [1, 0]],
    y: [[0, 0.5], [0.12, 0.85], [0.25, 1.1], [0.5, 1.13], [0.72, 0.98], [0.9, 0.7], [1, 0.6]],
    lean: [[0, 0.42], [0.15, 0.45], [0.35, 0.3], [0.6, 0.15], [0.85, -0.05], [1, 0]],
    twist: [[0, 0], [0.14, 0.25], [0.3, 0.58], [0.55, 0.62], [0.75, 0.35], [0.9, 0.08], [1, 0]],
    legL: [[0, -0.13], [0.14, -0.6], [0.3, -1.35], [0.55, -1.4], [0.75, -0.75], [0.9, -0.2], [1, 0]],
    legR: [[0, 0.87], [0.14, 0.45], [0.3, -1.0], [0.55, -1.25], [0.75, -0.6], [0.9, -0.15], [1, 0]] },
  // winded, over a fence: belly-first over the top rail with the legs dragging behind, then they drop down after you
  fenceS: { sAbs: [[0, 0], [0.2, 0.25], [0.45, 0.8], [0.65, 1.22], [0.85, 1.6], [1, 0]],
    y: [[0, 0.5], [0.2, 0.85], [0.4, 1.0], [0.6, 1.02], [0.8, 0.86], [0.92, 0.68], [1, 0.6]],
    lean: [[0, 0.62], [0.2, 0.95], [0.45, 1.15], [0.65, 1.0], [0.85, 0.3], [1, 0]],
    legL: [[0, -0.13], [0.2, 0.4], [0.45, 1.2], [0.65, 1.35], [0.85, 0.5], [1, 0]],
    legR: [[0, 0.87], [0.2, 0.95], [0.45, 1.3], [0.65, 1.4], [0.85, 0.6], [1, 0]] },
  // through a window: up onto the sill, a low dive along it with the legs trailing, hands down beyond the wall,
  // then the legs swing through and you come up standing
  // (window paths give s in metres, from S0 to S1, since the climb has to fit the wall)
  window: { sAbs: [[0, 0], [0.1, 0.05], [0.18, 0.15], [0.26, 0.35], [0.42, 0.85], [0.6, 1.5], [0.76, 2.05], [1, 0]],
    y: [[0, 0.53], [0.1, 0.82], [0.18, 1.1], [0.26, 1.25], [0.6, 1.27], [0.7, 1.2], [0.8, 1.0], [0.92, 0.7], [1, 0.6]],
    lean: [[0, 0.25], [0.1, 0.45], [0.18, 0.95], [0.26, 1.2], [0.42, 1.42], [0.6, 1.5], [0.74, 1.9], [0.9, 0.8], [1, 0]],
    legL: [[0, -0.3], [0.1, 0.1], [0.18, 0.5], [0.26, 0.95], [0.42, 1.45], [0.6, 1.55], [0.74, 1.95], [0.94, 0.45], [1, 0]],
    legR: [[0, 0.7], [0.1, 0.8], [0.18, 1.0], [0.26, 1.15], [0.42, 1.5], [0.6, 1.58], [0.74, 2.0], [0.94, 0.35], [1, 0]] },
  // winded, through a window: the same climb but slower and lower, a crawl along the sill, then a slide off the far edge
  windowS: { sAbs: [[0, 0], [0.12, 0.05], [0.22, 0.15], [0.32, 0.35], [0.5, 0.85], [0.68, 1.5], [0.82, 2.05], [1, 0]],
    y: [[0, 0.53], [0.12, 0.82], [0.22, 1.1], [0.32, 1.23], [0.68, 1.25], [0.76, 1.18], [0.85, 0.98], [0.95, 0.7], [1, 0.6]],
    lean: [[0, 0.35], [0.12, 0.5], [0.22, 0.95], [0.32, 1.18], [0.5, 1.36], [0.68, 1.45], [0.8, 1.88], [0.94, 0.75], [1, 0]],
    legL: [[0, -0.2], [0.12, 0.15], [0.22, 0.5], [0.32, 0.95], [0.5, 1.42], [0.68, 1.52], [0.8, 1.95], [0.96, 0.4], [1, 0]],
    legR: [[0, 0.7], [0.12, 0.85], [0.22, 1.0], [0.32, 1.15], [0.5, 1.48], [0.68, 1.56], [0.8, 2.0], [0.96, 0.3], [1, 0]] }
};
// one angle for the next sample: from where it was, step toward its target as far as it can go without hitting
// anything (at most `step`), so a leg that can't get past the rail yet waits tucked, then swings through; only if the
// old angle itself no longer clears does it look nearby for one that does
function stepClear(prev, target, ok, step) {
  const d = target - prev, m = Math.min(Math.abs(d), step) * Math.sign(d);
  for (let k = 4; k >= 0; k--) { const c = prev + m * k / 4; if (ok(c)) return c; }
  const n = nearestClear(prev, ok, 0.6); return n !== null ? n : nearestClear(target, ok, 1.2);
}
// build the plan: v.plan holds VAULT_N + 1 samples of { s, y, lean, legL, legR }
function buildVaultPlan(v) {
  const st = VAULT_STYLE[v.kind + (v.scramble ? 'S' : '')], obs = v.obs, S0 = v.s0, S1 = v.s1, out = [];
  let prev = null, lift = 0;
  for (let i = 0; i <= VAULT_N; i++) {
    // sAbs: metres past the start, with the last key standing for the full distance
    const t = i / VAULT_N, f = st.sAbs ? vSpline(st.sAbs.map((k, j) => j === st.sAbs.length - 1 ? [k[0], S1 - S0] : k), t) / (S1 - S0) : vSpline(st.s, t);
    const s = S0 + (S1 - S0) * f, y0 = vSpline(st.y, t), tl = vSpline(st.lean, t), tL = vSpline(st.legL, t), tR = vSpline(st.legR, t), tw = (st.twist ? vSpline(st.twist, t) : 0) * (v.twistSide || 1);
    // shift the hips (up for a sill, down for a window's head) only when bending can't clear; the shift eases back off
    lift *= 0.85;
    let got = null;
    for (let k = 0; k <= 16 && !got; k++) for (const sg of k ? [1, -1] : [1]) {
      if (got) break;
      const off = lift + sg * k * 0.03, y = y0 + off, torsoOk = a => !bodyHits(obs, s, y, a, [], 'torso');
      const ln = prev ? stepClear(prev.lean, tl, torsoOk, 0.2) : nearestClear(tl, torsoOk, 0.5); if (ln === null) continue;
      const okL = p => !bodyHits(obs, s, y, ln, [p], 'legs', tw, 'L'), okR = p => !bodyHits(obs, s, y, ln, [p], 'legs', tw, 'R');
      const a = prev ? stepClear(prev.legL, tL, okL, 0.18) : nearestClear(tL, okL, 0.9), b = prev ? stepClear(prev.legR, tR, okR, 0.18) : nearestClear(tR, okR, 0.9);
      if (a === null || b === null) continue;
      got = { s, y, lean: ln, legL: a, legR: b, twist: tw }; lift = off;
    }
    // nothing clears (shouldn't happen): hold the last pose where it was rather than jump
    out.push(prev = got || (prev ? { s, y: prev.y, lean: prev.lean, legL: prev.legL, legR: prev.legR, twist: tw } : { s, y: y0, lean: tl, legL: tL, legR: tR, twist: tw }));
  }
  // smooth out the corrections (they can kink from one sample to the next), then make sure the smoothed pose still clears
  for (let pass = 0; pass < 3; pass++) {
    const sm = out.map((p, i) => { if (i < 2 || i > VAULT_N - 2) return p; const q = {}; for (const k of ['y', 'lean', 'legL', 'legR']) { let a = 0; for (let d = -2; d <= 2; d++) a += out[i + d][k] * [1, 4, 6, 4, 1][d + 2]; q[k] = a / 16; } q.s = p.s; q.twist = p.twist; return q; });
    for (let i = 0; i <= VAULT_N; i++) {
      const q = sm[i];
      if (bodyHits(obs, q.s, q.y, q.lean, [q.legL, q.legR], null, q.twist)) {
        // keep the smoothing but lift and bend just enough again
        const ln = nearestClear(q.lean, a => !bodyHits(obs, q.s, q.y, a, [], 'torso'), 0.6);
        if (ln !== null) q.lean = ln;
        for (const k of ['legL', 'legR']) { const p = nearestClear(q[k], x => !bodyHits(obs, q.s, q.y, q.lean, [x], 'legs', q.twist, k === 'legL' ? 'L' : 'R'), 0.8); if (p !== null) q[k] = p; }
        if (bodyHits(obs, q.s, q.y, q.lean, [q.legL, q.legR], null, q.twist)) sm[i] = out[i];
      }
    }
    for (let i = 0; i <= VAULT_N; i++) out[i] = sm[i];
  }
  // the last few samples settle onto the standing pose exactly, so the landing picks up from it without a jump
  for (let i = VAULT_N - 6; i <= VAULT_N; i++) {
    const w = smooth((i - (VAULT_N - 6)) / 6), q = out[i], tq = { y: vSpline(st.y, i / VAULT_N), lean: vSpline(st.lean, i / VAULT_N), legL: vSpline(st.legL, i / VAULT_N), legR: vSpline(st.legR, i / VAULT_N) };
    const blended = {}; for (const k of ['y', 'lean', 'legL', 'legR']) blended[k] = q[k] + (tq[k] - q[k]) * w;
    if (!bodyHits(obs, q.s, blended.y, blended.lean, [blended.legL, blended.legR], null, q.twist) || i === VAULT_N) Object.assign(q, blended);
  }
  v.plan = out;
  // how fast you're travelling as you land, carried on into the walk (player/vaulting.js)
  v.endSpeed = (out[VAULT_N].s - out[VAULT_N - 1].s) * VAULT_N / v.dur;
}
// the pose at t, read off the plan
function vaultAt(v, t) {
  const x = clamp(t, 0, 1) * VAULT_N, i = Math.min(VAULT_N - 1, Math.floor(x)), u = x - i, a = v.plan[i], b = v.plan[i + 1], L = (p, q) => p + (q - p) * u;
  return { s: L(a.s, b.s), y: L(a.y, b.y), lean: L(a.lean, b.lean), legL: L(a.legL, b.legL), legR: L(a.legR, b.legR), twist: L(a.twist || 0, b.twist || 0) };
}
