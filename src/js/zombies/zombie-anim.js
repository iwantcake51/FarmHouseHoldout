// Zombie body animation: a pose worked out each frame for what the zombie's doing (shambling, sprinting, stomping,
// dragging itself along, clawing at you, pounding on boards and tearing them off, climbing), and every joint eased toward
// it on a spring of its own. The legs follow the stride closely; the trunk a little loosely; the arms and the head
// loosest of all, so they swing, lag behind and overshoot, and settle after every move. A hit, a shove or a sudden stop
// throws the joints rather than snapping them to a pose, and every zombie walks in its own way (its gait, dealt as it
// spawns: a limp, a dragged foot, the arms held out or hanging, how hunched and twitchy it is).

// ---- the rig: knees and elbows, and the trunk bending at the hip ----
// a zombie's legs are cut at the knee and its arms at the elbow (the survivor has knees only, player/player.js), the
// lower half of each hung from the joint (m.shinL, m.foreL...), so a shamble can drag a stiff leg, a runner kick its
// heels up, a crawler pull itself along on its forearms and a climber hook its arms over a sill. The upper body hangs
// from the hips (ZHIP up) instead of the feet, so it bends over at the waist
const ZHIP = 0.55, Z_KNEE = -0.27, Z_ELBOW = 0.26;
const ZG = {
  thigh: new THREE.BoxGeometry(0.19, 0.29, 0.22).translate(0, -0.145, 0), shin: new THREE.BoxGeometry(0.184, 0.28, 0.214).translate(0, -0.14, 0),
  upArm: new THREE.BoxGeometry(0.14, 0.14, 0.29).translate(0, 0, 0.125), fore: new THREE.BoxGeometry(0.13, 0.13, 0.29).translate(0, 0, 0.135)
};
function zombieRig(m) {
  ['L', 'R'].forEach(s => {
    const leg = m['leg' + s], sh = new THREE.Mesh(ZG.shin, leg.material); leg.geometry = ZG.thigh; sh.position.y = Z_KNEE; sh.castShadow = true; leg.add(sh); m['shin' + s] = sh;
    const arm = m['arm' + s], fo = new THREE.Mesh(ZG.fore, arm.material); arm.geometry = ZG.upArm; fo.position.z = Z_ELBOW; fo.castShadow = true; arm.add(fo); m['fore' + s] = fo;
  });
  m.upper.position.y = ZHIP; m.upper.children.forEach(c => { c.position.y -= ZHIP; });
}

// ---- the joints, and how loosely each follows ----
// root: rx pitch (forward +), rz roll (top toward -x +), y height, fw a step forward; the trunk at the hip: ux bend
// forward, uy twist (brings the -x shoulder forward +), uz lean (top toward -x +); ly the hips' twist; the head: hx nod
// down, hy turn toward +x, hz tilt; each shoulder: x pitch (0 straight ahead, + down, - up), y swing toward +x, z roll;
// elbows (- bends); hips: x (- forward), z (+ toward +x); knees (+ bends). The L limbs are the ones on the -x side
const ZJN = ['rx', 'rz', 'y', 'fw', 'ux', 'uy', 'uz', 'ly', 'hx', 'hy', 'hz', 'alx', 'aly', 'alz', 'arx', 'ary', 'arz', 'elL', 'elR', 'llx', 'llz', 'lrx', 'lrz', 'klx', 'krx'];
const ZJ = {}; ZJN.forEach((n, i) => { ZJ[n] = i; });
const ZJ_N = ZJN.length;
// each joint's spring: how quick (radians a second) and how damped (under 1 it overshoots and swings back)
const ZJ_W = new Float32Array(ZJ_N), ZJ_Z = new Float32Array(ZJ_N);
[[['rx', 'rz', 'fw'], 13, 0.8], [['y'], 16, 0.75], [['ux', 'uy', 'uz', 'ly'], 11, 0.6], [['hx', 'hy'], 8, 0.42], [['hz'], 6, 0.35],
  [['alx', 'aly', 'alz', 'arx', 'ary', 'arz'], 9, 0.45], [['elL', 'elR'], 11, 0.45], [['llx', 'llz', 'lrx', 'lrz'], 26, 0.9], [['klx', 'krx'], 28, 0.85]]
  .forEach(([ns, w, d]) => ns.forEach(n => { ZJ_W[ZJ[n]] = w; ZJ_Z[ZJ[n]] = d; }));
const _zT = new Float32Array(ZJ_N), _zK = new Float32Array(ZJ_N);
// how far each type goes in one full stride (two steps), metres: what turns the distance it covers into leg swing
const Z_STRIDE = { walker: 1.0, runner: 2.0, brute: 1.15, crawl: 0.55 };

// ---- each zombie's own way of moving ----
function zGait(type) {
  const brute = type === 'brute', runner = type === 'runner';
  return {
    limp: !runner && rand() < 0.4 ? (rand() < 0.5 ? -1 : 1) : 0,   // a bad leg (-1 the -x one): it swings short and stiff, and the body dips onto it
    drag: rand() < 0.5,                                             // the bad foot drags behind instead of hobbling
    arms: runner ? 3 : brute ? 2 : pick([0, 0, 1, 1, 2]),           // 0 both held out, 1 one out and one hanging, 2 both hanging, 3 pumping
    armSide: rand() < 0.5 ? -1 : 1,                                 // which arm's held out (1)
    lean: rr(0.06, 0.26), hunch: brute ? rr(0.12, 0.25) : rr(0, 0.22), tilt: rr(-0.32, 0.32), sway: rr(0.6, 1.4), stride: rr(0.85, 1.15),
    elbow: rr(0.1, 0.55), jerk: rr(0.15, 1), seed: rand() * 6.28, next: pick(Z_ATTACKS[type])
  };
}
function zAnimInit(z) {
  const a = z.an = { j: new Float32Array(ZJ_N), v: new Float32Array(ZJ_N), g: zGait(z.type), atkT: 9, wu: 0, bw: 0, rip: 0, sm: 0, twT: rr(0.5, 3), t: rand() * 9, lastLunge: 0, pside: 1, step: 0 };
  a.j[ZJ.alx] = a.j[ZJ.arx] = -0.15; a.j[ZJ.elL] = a.j[ZJ.elR] = -0.3;
}
// the attacks: swipe (one arm raked across), grab (both arms thrust out and pulled in), bite (a grab with the head lunging
// in), smash (a brute's two fists overhead and down), pounce (a runner's leaping grab), claw (a crawler's reach up at you)
const Z_ATTACKS = { walker: ['swipe', 'swipe', 'grab', 'bite'], runner: ['swipe', 'pounce'], brute: ['smash', 'smash', 'swipe'] };

// knocked by a hit: the joints are thrown (their springs' speed, not their pose), away from where it came from, so the
// body rocks with it and swings back; harder for the head on a headshot, an arm or a leg flung by its own hit
function zAnimHit(z, dx, dz, part, power) {
  const a = z.an; if (!a) return;
  const v = a.v, p = clamp(power, 0.2, 1.6) * (z.type === 'brute' ? 0.4 : 1), sf = Math.sin(z.face), cf = Math.cos(z.face);
  const along = dx * sf + dz * cf, side = dx * cf - dz * sf;   // the hit's push along the way it faces, and toward its +x
  v[ZJ.ux] += along * 7 * p; v[ZJ.uz] -= side * 6 * p; v[ZJ.rx] += along * 2.5 * p; v[ZJ.uy] += rr(-3, 3) * p;
  v[ZJ.hx] += along * (part === 'head' ? 16 : 6) * p; v[ZJ.hz] -= side * (part === 'head' ? 12 : 6) * p; v[ZJ.hy] += rr(-4, 4) * p;
  v[ZJ.alx] += along * 5 * p + rr(-3, 3) * p; v[ZJ.arx] += along * 5 * p + rr(-3, 3) * p;
  if (part === 'armL') { v[ZJ.alx] += 10 * p * Math.sign(along || 1); v[ZJ.aly] -= 8 * p; v[ZJ.elL] += 6 * p; }
  if (part === 'armR') { v[ZJ.arx] += 10 * p * Math.sign(along || 1); v[ZJ.ary] += 8 * p; v[ZJ.elR] += 6 * p; }
  if ((part === 'legL' || part === 'legR') && !z.crawl) { v[part === 'legL' ? ZJ.klx : ZJ.krx] += 14 * p; v[ZJ.y] -= 1.6 * p; v[ZJ.rz] += (part === 'legL' ? 2.5 : -2.5) * p; }
}
// the zombie's flung back by a shove (player/shove.js): rocked onto its heels, the arms thrown up
function zAnimShove(z) { const a = z.an; if (!a || z.crawl) return; const v = a.v; v[ZJ.ux] -= 9; v[ZJ.rx] -= 4; v[ZJ.alx] -= 10; v[ZJ.arx] -= 9; v[ZJ.hx] -= 8; v[ZJ.fw] -= 2; }

const _zsm = (t0, t1, t) => smooth(clamp((t - t0) / (t1 - t0), 0, 1));
// a pose blended in over another: each joint of o (a map of joint name to angle) by w
function zMix(T, o, w) { if (w <= 0.001) return; for (const k in o) T[ZJ[k]] += (o[k] - T[ZJ[k]]) * w; }
function zBoost(K, names, k) { for (const n of names) K[ZJ[n]] = Math.max(K[ZJ[n]], k); }

// ---- standing gaits ----
function zWalkPose(z, a, T, k, mv, ph, relP, near) {
  const g = a.g, sn = Math.sin(ph), cs = Math.cos(ph), bL = g.limp === -1 ? 1 : 0, bR = g.limp === 1 ? 1 : 0;
  const A = 0.4 * g.stride * Math.min(1.2, k) * mv;
  // the stride: each hip swings fore and aft, the knee bending as its leg swings through (most just after the foot
  // leaves the ground); a bad leg swings short with a stiff knee, and drags behind if that's its way
  T[ZJ.llx] = -sn * A * (1 - 0.55 * bL) + (g.drag && bL ? 0.2 * mv : 0);
  T[ZJ.lrx] = sn * A * (1 - 0.55 * bR) + (g.drag && bR ? 0.2 * mv : 0);
  const kn = (0.55 + 0.45 * Math.min(1.2, k)) * mv;
  T[ZJ.klx] = 0.07 + kn * Math.pow(Math.max(0, Math.cos(ph + 0.87)), 1.6) * (1 - 0.8 * bL);
  T[ZJ.krx] = 0.07 + kn * Math.pow(Math.max(0, -Math.cos(ph + 0.87)), 1.6) * (1 - 0.8 * bR);
  // the body sinks at each footfall and shifts its weight over the foot it's standing on; onto a bad leg it drops
  // and lurches that way
  const onL = Math.max(0, -cs), onR = Math.max(0, cs), dip = (bL * onL + bR * onR) * mv;
  T[ZJ.y] = (-0.03 * Math.abs(sn) - 0.055 * dip) * mv;
  T[ZJ.rz] = (-0.035 * cs * g.sway + 0.08 * (bL * onL - bR * onR)) * mv;
  T[ZJ.ux] = g.lean + g.hunch + 0.05 * Math.min(1.2, k) * mv;
  T[ZJ.uz] = -0.05 * cs * g.sway * mv; T[ZJ.uy] = -0.1 * sn * mv; T[ZJ.ly] = 0.1 * sn * mv;
  T[ZJ.hx] = -0.12 - 0.5 * g.lean + 0.04 * Math.abs(cs) * mv; T[ZJ.hy] = clamp(relP, -0.9, 0.9) * 0.6; T[ZJ.hz] = g.tilt + 0.07 * Math.sin(ph * 0.5 + g.seed) * g.sway;
  // the arms: held out ahead (a little bob with the stride), or hanging and swinging loose against the legs; hanging
  // ones come up toward you as it closes in
  const rk = 1 - _zsm(1.2, 4.5, near);
  [['l', -1], ['r', 1]].forEach(([s, sg]) => {
    const held = g.arms === 0 || (g.arms === 1 && g.armSide === sg), w = Math.max(held ? 1 : 0, rk * 0.85);
    const hx = 1.38 + 0.24 * sn * sg * mv * -1, hy = sg * 0.12, rx = -0.18 + 0.07 * Math.sin(ph + (sg > 0 ? 1.6 : 0)) * mv, ry = -sg * 0.08;
    T[ZJ['a' + s + 'x']] = hx + (rx - hx) * w; T[ZJ['a' + s + 'y']] = hy + (ry - hy) * w; T[ZJ['a' + s + 'z']] = 0;
    T[ZJ[s === 'l' ? 'elL' : 'elR']] = -0.35 + (-g.elbow + 0.35) * w;
  });
}
function zRunPose(z, a, T, k, mv, ph, relP) {
  const g = a.g, sn = Math.sin(ph), cs = Math.cos(ph), A = 0.82 * g.stride * Math.min(1.2, k) * mv;
  // a flat-out sprint, pitched forward: long strides with the heels kicked right up behind, the arms flailing out
  // ahead more than pumping, the head craned up to keep its eyes on you
  T[ZJ.llx] = -sn * A - 0.15 * mv; T[ZJ.lrx] = sn * A - 0.15 * mv;
  T[ZJ.klx] = 0.22 + 1.45 * Math.pow(Math.max(0, Math.cos(ph + 0.9)), 1.4) * mv; T[ZJ.krx] = 0.22 + 1.45 * Math.pow(Math.max(0, -Math.cos(ph + 0.9)), 1.4) * mv;
  T[ZJ.rx] = 0.3 * mv; T[ZJ.y] = (0.045 * Math.abs(cs) - 0.05) * mv; T[ZJ.rz] = -0.03 * cs * mv;
  T[ZJ.ux] = 0.12 + g.hunch * 0.5; T[ZJ.uy] = -0.22 * sn * mv; T[ZJ.ly] = 0.18 * sn * mv; T[ZJ.uz] = -0.04 * cs * mv;
  T[ZJ.hx] = -0.38; T[ZJ.hy] = clamp(relP, -0.9, 0.9) * 0.5; T[ZJ.hz] = g.tilt * 0.5 + 0.05 * sn;
  const fl = Math.sin(ph * 0.5 + g.seed);
  T[ZJ.alx] = -0.45 + 0.55 * sn * mv + 0.1 * fl; T[ZJ.arx] = -0.45 - 0.55 * sn * mv - 0.1 * fl;
  T[ZJ.aly] = 0.15 + 0.2 * fl; T[ZJ.ary] = -0.15 + 0.2 * fl; T[ZJ.alz] = -0.2; T[ZJ.arz] = 0.2;
  T[ZJ.elL] = -0.75 - 0.35 * Math.max(0, sn); T[ZJ.elR] = -0.75 - 0.35 * Math.max(0, -sn);
}
function zBrutePose(z, a, T, k, mv, ph, relP) {
  const g = a.g, sn = Math.sin(ph), cs = Math.cos(ph), A = 0.42 * Math.min(1.2, k) * mv;
  // a slow, heavy stomp, legs set wide and the knees never straight, the whole body rolling from side to side over
  // each foot, hunched, the arms hanging heavy and swinging with the body
  T[ZJ.llx] = -sn * A; T[ZJ.lrx] = sn * A; T[ZJ.llz] = -0.07; T[ZJ.lrz] = 0.07;
  T[ZJ.klx] = 0.22 + 0.6 * Math.pow(Math.max(0, Math.cos(ph + 0.87)), 1.5) * mv; T[ZJ.krx] = 0.22 + 0.6 * Math.pow(Math.max(0, -Math.cos(ph + 0.87)), 1.5) * mv;
  T[ZJ.rz] = -0.09 * cs * mv; T[ZJ.y] = -0.03 - 0.05 * Math.abs(sn) * mv;
  T[ZJ.ux] = 0.26 + g.hunch; T[ZJ.uy] = -0.08 * sn * mv; T[ZJ.uz] = 0.05 * cs * mv;
  T[ZJ.hx] = 0.05; T[ZJ.hy] = clamp(relP, -0.9, 0.9) * 0.4; T[ZJ.hz] = g.tilt * 0.4;
  T[ZJ.alx] = 1.18 + 0.2 * sn * mv; T[ZJ.arx] = 1.18 - 0.2 * sn * mv; T[ZJ.aly] = -0.28; T[ZJ.ary] = 0.28; T[ZJ.elL] = T[ZJ.elR] = -0.45;
  // each footfall kicks up a little dust
  const st = Math.floor(ph / Math.PI);
  if (st !== a.step) { a.step = st; if (mv > 0.5 && z.vis > 0.3) { const sd = st % 2 ? 1 : -1, cf = Math.cos(z.face), sf = Math.sin(z.face); burst(z.x + cf * sd * 0.2 * z.T.scale, 0.05, z.z - sf * sd * 0.2 * z.T.scale, 2, 'dust'); } }
}
// ---- dragging itself along: one arm reaches out and claws in while the other comes round, the body surging forward
// with each pull and rolling toward the arm that's pulling, the head craned up at you, what's left of the legs
// dragging behind and kicking feebly ----
function zCrawlPose(z, a, T, mv, ph, relP, near) {
  const g = a.g, s = z.T.scale, one = !(z.limbs.armL && z.limbs.armR);
  T[ZJ.rx] = 1.2 + 0.05 * Math.sin(2 * ph) * mv; T[ZJ.y] = 0.2 * s + 0.025 * Math.max(0, Math.sin(2 * ph)) * mv;
  T[ZJ.rz] = (one ? 0.18 : 0.1) * Math.sin(ph) * mv; T[ZJ.uy] = 0.15 * Math.sin(ph) * mv; T[ZJ.ux] = 0;
  T[ZJ.hx] = -0.75 + 0.06 * Math.sin(2 * ph); T[ZJ.hy] = clamp(relP, -0.9, 0.9) * 0.5; T[ZJ.hz] = g.tilt * 0.6;
  [['l', 0], ['r', Math.PI]].forEach(([sd, off]) => {
    const u = (((ph + (one ? 0 : off)) / (2 * Math.PI)) % 1 + 1) % 1, X = ZJ['a' + sd + 'x'], Z = ZJ['a' + sd + 'z'], E = ZJ[sd === 'l' ? 'elL' : 'elR'], sg = sd === 'l' ? -1 : 1;
    let x, e, zz;
    if (u < 0.55) { const q = smooth(u / 0.55); x = -1.85 + 1.1 * q; e = -0.15 - 1.1 * q; zz = 0; }   // planted, hauling the body up to it
    else { const q = smooth((u - 0.55) / 0.45); x = -0.75 - 1.1 * q; e = -1.25 + 1.1 * q; zz = sg * 0.35 * Math.sin(q * Math.PI); }   // lifted and swung out ahead again
    // standing still it rests on its forearms, reaching for you if you're close
    const rest = -1.45 - 0.35 * (1 - _zsm(0.8, 3, near));
    T[X] = rest + (x - rest) * mv; T[E] = -0.6 + (e + 0.6) * mv; T[Z] = zz * mv; T[ZJ['a' + sd + 'y']] = -sg * 0.1;
  });
  T[ZJ.llx] = 0.12 + 0.14 * Math.sin(ph + 1) * mv; T[ZJ.lrx] = 0.12 + 0.14 * Math.sin(ph + 1 + Math.PI) * mv;
  T[ZJ.klx] = 0.25 + 0.35 * Math.max(0, Math.sin(ph + 1)) * mv; T[ZJ.krx] = 0.25 + 0.35 * Math.max(0, -Math.sin(ph + 1)) * mv;
}
// buckling onto the ground as a leg goes (z.crawlT runs 0 to 1): the other knee gives, it pitches forward, slaps down
// onto its hands and settles into the crawl
function zCollapsePose(z, T, K, t) {
  const s = z.T.scale;
  if (t < 0.25) { const q = smooth(t / 0.25); zMix(T, { y: -0.14, rx: 0.25, ux: 0.25, klx: 1.1, krx: 1.1, alx: -1.0, arx: -0.8, elL: -0.9, elR: -0.7, hx: -0.3 }, q); }
  else if (t < 0.62) { const q = (t - 0.25) / 0.37; zMix(T, { y: -0.14 + (0.2 * s + 0.14) * q, rx: 0.25 + 1.15 * q * q, ux: 0.25 - 0.25 * q, alx: -1.0 - 0.6 * q, arx: -0.8 - 0.75 * q, elL: -0.3, elR: -0.3, klx: 0.6, krx: 0.6, hx: -0.5 }, 1); }
  else { const q = (t - 0.62) / 0.38; zMix(T, { rx: 1.4 - 0.2 * smooth(q), y: 0.2 * s }, 1 - smooth(q)); }
  zBoost(K, ['rx', 'y'], 1.6);
}

// ---- attacks, and breaking boards ----
function zAttackPose(z, a, T, K) {
  const t = a.atkT, kind = a.kind, sg = a.aside;   // sg: the striking arm's side (-1 the L arm)
  const S = sg < 0 ? 'l' : 'r', E = sg < 0 ? 'elL' : 'elR';
  // the wind-up as it closes in for the next one (wu), then the strike (st): quick in, held a moment, eased back out
  const st = t < 0.09 ? smooth(t / 0.09) : t < 0.24 ? 1 : 1 - _zsm(0.24, 0.62, t), wu = a.wu * (1 - st), next = a.g.next;
  const W = {}, Sx = {};
  const pose = (kd, o, w) => {
    if (kd === 'swipe') { o['a' + S + 'x'] = w ? -1.25 : -0.3; o['a' + S + 'y'] = w ? sg * 0.75 : -sg * 0.95; o[E] = w ? -1.15 : -0.15; o.uy = w ? sg * 0.32 : -sg * 0.42; o.ux = w ? -0.05 : 0.38; o.fw = w ? -0.04 : 0.16; o.hx = w ? -0.25 : 0.1; }
    else if (kd === 'grab' || kd === 'bite' || kd === 'pounce') {
      o.alx = w ? -0.65 : -0.08; o.arx = w ? -0.65 : -0.08; o.aly = w ? -0.42 : 0.2; o.ary = w ? 0.42 : -0.2; o.elL = o.elR = w ? -0.75 : -0.05;
      o.ux = w ? -0.08 : kd === 'pounce' ? 0.5 : 0.36; o.fw = w ? -0.05 : kd === 'pounce' ? 0.32 : 0.18; o.hx = w ? -0.3 : kd === 'bite' ? 0.42 : 0.15;
      if (kd === 'pounce' && !w) { o.y = 0.08; o.klx = o.krx = 0.5; }
    }
    else if (kd === 'smash') { o.alx = o.arx = w ? -2.65 : 0.25; o.aly = w ? 0.15 : 0.12; o.ary = w ? -0.15 : -0.12; o.elL = o.elR = w ? -0.75 : -0.1; o.ux = w ? -0.18 : 0.55; o.rx = w ? 0 : 0.08; o.fw = w ? -0.06 : 0.14; o.hx = w ? -0.35 : 0.25; o.klx = o.krx = w ? 0.15 : 0.45; o.y = w ? 0 : -0.08; }
  };
  pose(next, W, true); pose(kind, Sx, false);
  zMix(T, W, wu); zMix(T, Sx, st);
  if (st > 0.01) zBoost(K, ['alx', 'aly', 'arx', 'ary', 'elL', 'elR', 'ux', 'uy', 'hx', 'fw'], 2.6 * st + 1 * (1 - st));
}
// pounding on boards (z.atkBoard): a fist raised high and brought down on them every beat (when the AI's swing timer
// comes round, zombies/ai.js), the arms taking turns, the other clawing at the planks; the body rocks into each blow.
// A crawler does it from the ground, propped up and reaching
function zBoardPose(z, a, T, K) {
  const w = a.bw; if (w < 0.01) return;
  const u = 1 - clamp(z.atk / 0.9, 0, 1), sg = a.pside, H = sg < 0 ? 'l' : 'r', Oo = sg < 0 ? 'r' : 'l', E = sg < 0 ? 'elL' : 'elR', EO = sg < 0 ? 'elR' : 'elL';
  const up = _zsm(0.2, 0.85, u), hit = u < 0.16 ? 1 - u / 0.16 : 0, o = {};
  if (z.crawl) {
    o.rx = 0.62; o.ux = 0.1; o.hx = -0.5;
    o['a' + H + 'x'] = -1.55 - 0.85 * up + 0.2 * hit; o[E] = -0.25 - 0.8 * up; o['a' + Oo + 'x'] = -1.7 + 0.05 * Math.sin(a.t * 13); o[EO] = -0.5;
  } else {
    o['a' + H + 'x'] = -0.55 - 1.75 * up + 0.12 * hit; o['a' + H + 'y'] = -sg * 0.12; o[E] = -0.3 - 1.1 * up;
    o['a' + Oo + 'x'] = -0.6 + 0.08 * Math.sin(a.t * 12.5); o['a' + Oo + 'y'] = sg * 0.1; o[EO] = -0.65 + 0.15 * Math.sin(a.t * 9);
    o.ux = 0.14 + 0.2 * hit - 0.06 * up; o.uy = sg * 0.18 * up - sg * 0.12 * hit; o.hx = 0.05 - 0.15 * up; o.fw = 0.06 * hit;
    o.llx = -0.22; o.lrx = 0.18; o.klx = 0.22; o.krx = 0.12;
  }
  zMix(T, o, w); zBoost(K, ['a' + H + 'x', E, 'ux'], 1 + 1.8 * hit + 0.5 * up);
}
// a plank torn off: the arms yanked back with it, the body thrown back a step
function zRipPose(z, a, T, K) {
  const w = a.rip; if (w < 0.01) return;
  zMix(T, z.crawl ? { alx: -0.6, arx: -0.6, elL: -1.2, elR: -1.2, rx: 0.9 } : { alx: 0.45, arx: 0.5, elL: -1.45, elR: -1.35, ux: -0.32, fw: -0.12, hx: -0.3 }, Math.sin(Math.min(1, w) * Math.PI * 0.5));
  zBoost(K, ['alx', 'arx', 'elL', 'elR'], 2.2);
}
// ---- every frame ----
function animateZombie(z, dt, dp, relP) {
  const a = z.an, g = a.g, m = z.m, T = _zT, K = _zK, j = a.j, v = a.v;
  if (!(dt > 0)) return;
  a.t += dt;
  T.fill(0); K.fill(1);
  // how it's really moving: its speed, how fast it's speeding up along the way it faces, and how fast it's turning
  const mx = z.x - (a.px ?? z.x), mz = z.z - (a.pz ?? z.z); a.px = z.x; a.pz = z.z;
  let d = Math.hypot(mx, mz); if (d > 1.5) d = 0;   // (a jump, not a step)
  const sf = Math.sin(z.face), cf = Math.cos(z.face), vf = (mx * sf + mz * cf) / dt;
  const spd0 = d / dt; a.spd = (a.spd || 0) + (spd0 - (a.spd || 0)) * Math.min(1, dt * 10);
  const vfS = (a.vf || 0) + (vf - (a.vf || 0)) * Math.min(1, dt * 8), acc = clamp((vfS - (a.vf || 0)) / dt, -9, 9); a.vf = vfS;
  a.acc = (a.acc || 0) + (acc - (a.acc || 0)) * Math.min(1, dt * 6);
  const tw = clamp(angDiff(z.face, a.pf ?? z.face) / dt, -6, 6); a.pf = z.face; a.tw = (a.tw || 0) + (tw - (a.tw || 0)) * Math.min(1, dt * 6);
  const kind = z.crawl ? 'crawl' : z.type;
  if (!z.vault) z.phase += d * 2 * Math.PI / (Z_STRIDE[kind] * (z.type === 'runner' ? 1 : z.T.scale));
  const ref = z.speed * (z.crawl ? 0.32 : 1), k = a.spd / ref, mv = smooth(clamp(a.spd / (ref * 0.3), 0, 1)), ph = z.phase;
  // the lunge counter going back up to 1 is a new swing (at you or at the boards)
  if (z.lunge > a.lastLunge + 0.5) {
    if (z.atkBoard) a.pside = -a.pside;
    else { a.atkT = 0; a.kind = a.g.next; a.aside = rand() < 0.5 ? -1 : 1; a.g.next = z.crawl ? 'claw' : pick(Z_ATTACKS[z.type]); }
  }
  a.lastLunge = z.lunge; a.atkT += dt;
  if (z.vault) zClimbPose(z, T, K);
  else if (z.crawl && z.crawlT < 1) { zCrawlPose(z, a, T, 0, ph, relP, dp); zCollapsePose(z, T, K, z.crawlT); }
  else if (z.crawl) zCrawlPose(z, a, T, mv, ph, relP, dp);
  else if (z.type === 'runner') zRunPose(z, a, T, k, mv, ph, relP);
  else if (z.type === 'brute') zBrutePose(z, a, T, k, mv, ph, relP);
  else zWalkPose(z, a, T, k, mv, ph, relP, dp);
  if (!z.vault) {
    // standing about: a slow sway, the weight shifting, the head lolling round to keep you in view
    const idle = 1 - mv, it = a.t + g.seed;
    if (!z.crawl) { T[ZJ.rz] += 0.03 * Math.sin(it * 1.1) * idle * g.sway; T[ZJ.ux] += 0.04 * Math.sin(it * 0.8) * idle; T[ZJ.uz] += 0.04 * Math.sin(it * 0.7 + 1) * idle; T[ZJ.klx] += 0.06 * idle; T[ZJ.krx] += 0.06 * idle; }
    T[ZJ.hz] += 0.08 * Math.sin(it * 0.6) * idle;
    // the momentum of the body: speeding up it lags back, pulling up short it carries on forward, and into a turn it
    // leans in while the hanging arms swing out
    T[ZJ.ux] -= a.acc * 0.014; T[ZJ.hx] += a.acc * 0.01; T[ZJ.alx] += a.acc * 0.018; T[ZJ.arx] += a.acc * 0.018;
    const turnK = Math.min(1, a.spd / 1.2) * (z.type === 'runner' ? 1.6 : 1);
    T[ZJ.rz] -= a.tw * 0.02 * turnK; T[ZJ.aly] -= a.tw * 0.03; T[ZJ.ary] -= a.tw * 0.03;
    // wobbly on its feet while it's staggered: arms out, head lolling, knees soft
    if (z.stagger > 0 && !z.crawl) { const sw = Math.min(1, z.stagger / 0.3), q = Math.sin(a.t * 7.3); T[ZJ.aly] -= 0.35 * sw; T[ZJ.ary] += 0.35 * sw; T[ZJ.hz] += 0.25 * q * sw; T[ZJ.klx] += 0.2 * sw; T[ZJ.krx] += 0.2 * sw; T[ZJ.rz] += 0.06 * q * sw; }
    // thrown back by a shove, still finding its feet
    if (z.shoved > 0 && !z.crawl) { const q = Math.sin(Math.min(1, z.shoved) * Math.PI * 0.5); T[ZJ.rx] -= q * 0.18; T[ZJ.ux] -= q * 0.4; T[ZJ.hx] -= q * 0.3; T[ZJ.alx] -= q * 0.6; T[ZJ.arx] -= q * 0.5; T[ZJ.fw] -= q * 0.1; }
    // the swing at you and the wind-up for it as it closes in
    const ready = !z.atkBoard && dp < z.T.r + 1.15 && z.atk > 0 && z.atk < 0.4 && !(z.stagger > 0) && !P.dead;
    a.wu += ((ready ? 1 - z.atk / 0.4 : 0) - a.wu) * Math.min(1, dt * 10);
    if (!z.crawl) zAttackPose(z, a, T, K);
    else if (a.atkT < 0.6) { const st = a.atkT < 0.1 ? smooth(a.atkT / 0.1) : 1 - _zsm(0.1, 0.6, a.atkT); zMix(T, { rx: 0.85, alx: -2.1 + 0.4 * st, arx: -1.9, elL: -0.2, hx: -0.2 }, st); zBoost(K, ['alx', 'rx', 'hx'], 2.4); }
    a.bw += ((z.atkBoard ? 1 : 0) - a.bw) * Math.min(1, dt * 6); zBoardPose(z, a, T, K);
    a.rip = Math.max(0, a.rip - dt * 1.8); zRipPose(z, a, T, K);
  }
  // now and then a twitch: the head jerks, a shoulder hitches
  if ((a.twT -= dt) <= 0) {
    a.twT = rr(0.7, 3.5) / (0.3 + g.jerk);
    v[ZJ.hy] += rr(-5, 5) * g.jerk; v[ZJ.hz] += rr(-5, 5) * g.jerk; v[pick([ZJ.alz, ZJ.arz, ZJ.aly, ZJ.ary])] += rr(-4, 4) * g.jerk; v[ZJ.uz] += rr(-1.5, 1.5) * g.jerk;
  }
  // every joint eased toward its target on its spring (in small steps if the frame was long)
  const n = dt > 0.021 ? Math.ceil(dt / 0.016) : 1, h = dt / n;
  for (let s = 0; s < n; s++) for (let i = 0; i < ZJ_N; i++) {
    const w = ZJ_W[i] * _zK[i], ac = w * w * (_zT[i] - j[i]) - 2 * ZJ_Z[i] * w * v[i];
    v[i] += ac * h; j[i] += v[i] * h;
  }
  // standing on whatever's underfoot (the porch, its step, the floorboards: surfaceY in world/house.js)
  const sy = z.vault ? (a.base || 0) : surfaceY(z.x, z.z); a.base = (a.base ?? sy) + (sy - (a.base ?? sy)) * Math.min(1, dt * 14);
  zApply(z, m, j, a.base);
}
function zApply(z, m, j, base) {
  const s = z.T.scale, sq = z.squash, sf = Math.sin(z.face), cf = Math.cos(z.face), fw = j[ZJ.fw] * s;
  m.g.position.set(z.x + sf * fw, base + Math.max(-0.45 * s, j[ZJ.y]), z.z + cf * fw);
  m.g.rotation.set(j[ZJ.rx], z.face, j[ZJ.rz]);
  m.g.scale.set(s * (1 + sq * 0.05), s * (1 - sq * 0.06), s * (1 + sq * 0.05));
  m.upper.rotation.set(j[ZJ.ux], j[ZJ.uy], j[ZJ.uz]); m.lower.rotation.y = j[ZJ.ly];
  if (z.limbs.head) m.head.rotation.set(j[ZJ.hx], j[ZJ.hy], j[ZJ.hz]);
  if (z.limbs.armL) { m.armL.rotation.set(j[ZJ.alx], j[ZJ.aly], j[ZJ.alz]); m.foreL.rotation.x = Math.min(0.05, j[ZJ.elL]); }
  if (z.limbs.armR) { m.armR.rotation.set(j[ZJ.arx], j[ZJ.ary], j[ZJ.arz]); m.foreR.rotation.x = Math.min(0.05, j[ZJ.elR]); }
  if (z.limbs.legL) { m.legL.rotation.set(j[ZJ.llx], 0, j[ZJ.llz]); m.shinL.rotation.x = Math.max(-0.05, j[ZJ.klx]); }
  if (z.limbs.legR) { m.legR.rotation.set(j[ZJ.lrx], 0, j[ZJ.lrz]); m.shinR.rotation.x = Math.max(-0.05, j[ZJ.krx]); }
}
