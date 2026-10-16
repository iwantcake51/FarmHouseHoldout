// Zombie AI: the way to you, climbing fences and breaking in through windows (tearing the boards off first), attacks on
// you and brute concussion. The body's animated in zombies/zombie-anim.js, the climbs are in
// zombies/climb.js.

// a wall, a fence or a window frame between a zombie and you stops its swing: it can catch you while you're climbing
// through a window or over a fence (you're in that cell then, and the cells you're each in don't count), but not once
// you're past it and the frame is between you
function reachBlocked(x0, z0, x1, z1) {
  const si = ci(x0), sj = ci(z0), ti = ci(x1), tj = ci(z1), n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1);
  for (let s = 1; s < n; s++) {
    const i = ci(x0 + (x1 - x0) * s / n), j = ci(z0 + (z1 - z0) * s / n);
    if ((i === si && j === sj) || (i === ti && j === tj) || !inb(i, j)) continue;
    const k = idx(i, j), t = cell[k], o = openAt[k];
    if (t === WALL || t === FENCE || (t === OPEN && o && (o.kind === 'window' || o.boards.length))) return true;
  }
  return false;
}
// which side of an opening a point's on (1: the side its normal points to, the outside)
const openSide = (o, x, z) => Math.sign((x - o.x) * o.nx + (z - o.z) * o.nz) || 1;
// a window takes one zombie at a time, but only just: the next goes in as soon as the one ahead is halfway through
function winFree(o, z) { const b = o.busy; if (!b || b === z) return true; if (b.dead || !b.vault || b.vault.t > 0.5) { o.busy = null; return true; } return false; }
// at a window: the boards to tear down first (returned), then it climbs in (zombies/climb.js)
function atWindow(z, o) {
  if (!winFree(o, z)) return null;
  if (o.boards.length) return o;
  const zs = openSide(o, z.x, z.z), dx = -o.nx * zs, dz = -o.nz * zs, x1 = o.x + dx, z1 = o.z + dz;
  if (!hardBlocked(ci(x1), ci(z1))) startClimb(z, 'window', o.x, o.z, dx, dz, x1, z1, o);
  return null;
}
// over a fence: straight across it, square to the way it runs, toward the side the way in wants; it lands in that
// cell's neighbour the flow likes best (if where the climb leaves it is no good)
function fenceCross(z, i, j, bi, bj, fl) {
  const isF = (a, b) => inb(a, b) && cell[idx(a, b)] === FENCE, runsX = isF(bi - 1, bj) || isF(bi + 1, bj), runsZ = isF(bi, bj - 1) || isF(bi, bj + 1);
  let ei = -1, ej = -1, ed = 1e9;
  for (const [di, dj] of DIRS) { const ni = bi + di, nj = bj + dj; if (!inb(ni, nj) || hardBlocked(ni, nj) || (ni === i && nj === j)) continue; const d = fl[idx(ni, nj)]; if (d < ed) { ed = d; ei = ni; ej = nj; } }
  if (ei < 0) return;
  const fx = cxw(bi), fz = cxw(bj); let dx, dz;
  if (runsX && !runsZ) { dx = 0; dz = Math.sign(fz - z.z) || 1; }
  else if (runsZ && !runsX) { dz = 0; dx = Math.sign(fx - z.x) || 1; }
  else { dx = cxw(ei) - fx; dz = cxw(ej) - fz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; }
  startClimb(z, 'fence', fx, fz, dx, dz, cxw(ei), cxw(ej), null);
}
// how fast bunched-up zombies drift apart (metres a second when right on top of each other)
const SPREAD = 2.6;
// a window or doorway in this cell or any next to it
function nearOpening(i, j) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (inb(i + a, j + b) && cell[idx(i + a, j + b)] === OPEN) return true; return false; }
// a hit flashes the body white-hot, cooling through red as the flash runs out; burning, just a flicker of warmth (the
// char's embers do the glowing: effects/body-blood.js)
function zFlash(z, dt) {
  const m = z.m; z.flash = Math.max(0, z.flash - dt);
  if (z.flash > 0) { const k = z.flash / 0.14; for (const mt of [m.mats.skin, m.mats.shirt, m.mats.pants]) mt.emissive.setRGB(0.35 + 0.6 * k, 0.1 + 0.55 * k, 0.07 + 0.45 * k); }
  else { const e = z.burn > 0 ? (rand() < 0.5 ? 0x2c1003 : 0x1c0902) : 0x000000; m.mats.skin.emissive.setHex(e); m.mats.shirt.emissive.setHex(e); m.mats.pants.emissive.setHex(e); }
}
// zombie AI: the way to you, climbing and breaking in, attacks; then the body's animated (zombies/zombie-anim.js). In
// co-op each goes for whichever survivor still standing is nearest, and on a joiner's screen they're the host's: each
// eased to where the host's game has it (net/sync.js), only the body and the blood played out here
function updateZombies(dt) {
  const pup = netClient(), tg = netTargets(), allDown = tg.every(q => q.dead);
  let nearest = 99, nearZ = null; zHitMe = false;
  for (let k = zombies.length - 1; k >= 0; k--) {
    const z = zombies[k], m = z.m;
    if (pup) puppetMove(z, dt);
    else if ((z.vx || z.vz) && !z.vault) { moveCircle(z, z.vx * dt, z.vz * dt, z.T.r); const f = Math.exp(-9 * dt); z.vx *= f; z.vz *= f; if (Math.abs(z.vx) + Math.abs(z.vz) < 0.02) z.vx = z.vz = 0; }
    // who it's after: the nearest survivor still on their feet (alone, that's you)
    let t = tg[0], td = 1e9;
    for (const q of tg) { if (q.dead && !allDown) continue; const d = (q.x - z.x) * (q.x - z.x) + (q.z - z.z) * (q.z - z.z); if (d < td) { td = d; t = q; } }
    const dxp = t.x - z.x, dzp = t.z - z.z, dp = Math.hypot(dxp, dzp), relP = angDiff(Math.atan2(dxp, dzp), z.face);
    const dme = t.me ? dp : Math.hypot(P.x - z.x, P.z - z.z);
    if (dme < nearest) { nearest = dme; nearZ = z; }
    if (z.burn > 0 && z.stain) z.stain.char = Math.min(1, z.stain.char + dt * 0.17);   // charring as it burns: black all over in about six seconds
    // on fire (dragon's breath): flames on it while you can see it, and the fire hurts in ticks, every
    // half second, each shown as an orange damage number like any other hit (the host's game burns it in co-op)
    if (z.burn > 0) {
      z.burn -= dt; z.burnT = (z.burnT || 0) + dt;
      if (z.vis > 0.3) { const s = z.T.scale; burnFx(z.x, z.z, (z.crawl ? 0.1 : 0.45) * s, (z.crawl ? 0.5 : 1.5) * s, 0.2 * s, dt); }
      if (z.burnT >= BURN_TICK) { z.burnT -= BURN_TICK; if (!pup && burnHurt(z)) continue; }
    } else z.burnT = 0;
    if (z.bleed > 0) { z.bleed -= dt; if (!pup) z.hp -= (z.bleedR || BLEED_R) * dt; if (z.bleed <= 0) z.bleedR = 0; if (rand() < dt * (2 + (z.bleedR || BLEED_R) * 0.15)) splat(z.x, z.z, 'drop', rr(0.12, 0.25)); if (z.hp <= 0 && !pup) { killZombie(z, -Math.sin(z.face), -Math.cos(z.face), 'bleed', 'torso', 0); continue; } }
    for (let q = z.spurts.length - 1; q >= 0; q--) {
      const sp = z.spurts[q]; sp.t -= dt; if (sp.t <= 0) { z.spurts.splice(q, 1); continue; }
      if (rand() < 0.5) { const v = sp.o ? new V3(...sp.p).applyMatrix4(sp.o.matrixWorld) : m.g.localToWorld(new V3(...STUMP[sp.part])); burst(v.x, Math.max(0.15, v.y), v.z, 1, 'blood', rr(-1, 1), rr(-1, 1), 0.8); }
    }
    z.atk -= dt; z.lunge = Math.max(0, z.lunge - dt * 3); z.stagger -= dt; z.squash = Math.max(0, z.squash - dt * 8); z.pushSlow = Math.max(0, (z.pushSlow || 0) - dt); z.shoved = Math.max(0, (z.shoved || 0) - dt * 2.2);
    // climbing over a fence or in through a window: nothing else till it's done
    if (z.vault) { stepClimb(z, dt); z.atkBoard = null; animateZombie(z, dt, dp, relP); zFlash(z, dt); continue; }
    if (pup) puppetBoard(z, dme);   // tearing at the boards the host says it's at
    // still out in the fog (zombies/spawn.js): it walks straight in along its trail to the gap in the trees, where the
    // farm's own pathfinding takes over; out there there's no grid to steer by or bump into
    if (z.out && !pup) {
      const ax = z.gx - z.x, az = z.gz - z.z, al = Math.hypot(ax, az);
      if (al < 0.2) z.out = false;
      else {
        const sp = Math.min(al, z.speed * dt * (z.stagger > 0 ? 0.25 : 1) * (z.crawl ? 0.32 : 1));
        z.x += ax / al * sp; z.z += az / al * sp;
        z.face += angDiff(Math.atan2(ax, az), z.face) * Math.min(1, dt * 8);
      }
    }
    // (outside while you're indoors, the field for the window or door it was given: zombies/pathfinding.js)
    const fl = pup ? dist : zField(z, t), via = !!z.via, i = ci(z.x), j = ci(z.z), here = inb(i, j) ? fl[idx(i, j)] : 1e9;
    let tx = t.x, tz = t.z, attackingBoard = null;
    if ((via || here > 1.6) && !z.out && !pup) {
      let bestD = here, bi = -1, bj = -1;
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj; if (!inb(ni, nj)) continue;
        if (di && dj && !diagOk(i, j, di, dj)) continue;
        const d = fl[idx(ni, nj)]; if (d < bestD) { bestD = d; bi = ni; bj = nj; }
      }
      if (bi >= 0) {
        // the next cell on its way: a fence to climb, a window to break in through, boards to tear down
        const op = openAt[idx(bi, bj)], dn = Math.hypot(cxw(bi) - z.x, cxw(bj) - z.z);
        if (cell[idx(bi, bj)] === FENCE && dn < (z.crawl ? 1.35 : 0.85) + z.T.r) fenceCross(z, i, j, bi, bj, fl);
        else if (op && op.kind === 'window' && dn < (z.crawl ? 1.3 : 0.8) + z.T.r) attackingBoard = atWindow(z, op);
        else if (op && op.boards.length && dn < 0.95 + z.T.r) attackingBoard = op;
        if (z.vault) { z.atkBoard = null; animateZombie(z, dt, dp, relP); zFlash(z, dt); continue; }
        tx = cxw(bi); tz = cxw(bj);
      }
    }
    const arms = (z.limbs.armL ? 1 : 0) + (z.limbs.armR ? 1 : 0), armMul = arms === 2 ? 1 : arms === 1 ? 0.7 : 0.4;
    if (!pup) z.atkBoard = attackingBoard;
    if (attackingBoard) {
      z.face += angDiff(Math.atan2(tx - z.x, tz - z.z), z.face) * Math.min(1, dt * 8);
      const top = attackingBoard.boards.length - 1;
      attackingBoard.boards[top] -= z.T.bdps * armMul * (z.crawl ? 0.5 : 1) * dt;
      // a blow lands on the boards each beat: a thump, the plank jumps, a little dust off it
      if (z.atk <= 0) { z.atk = 0.9; z.lunge = 1; soundAt(z.x, z.z, () => nz(0.08, 'lowpass', 700, 200, 0.18 * clamp(1 - dme / 18, 0, 1)), true); boardJolt(attackingBoard, z); }
      if (attackingBoard.boards[top] <= 0) { breakBoard(attackingBoard, z); if (z.an) z.an.rip = 1; netBoardBroke(attackingBoard, z); }
    } else if (!z.out && !pup) {
      const ax = tx - z.x, az = tz - z.z, al = Math.hypot(ax, az);
      if (al > 0.05 && !(dp < z.T.r + 0.5 && here <= 1.6)) {   // they keep closing in while you go down, right up until the world stops
        const sp = z.speed * dt * (z.stagger > 0 ? 0.25 : 1) * (z.crawl ? 0.32 : 1) * (z.pushSlow > 0 ? 0.45 + 0.55 * (1 - z.pushSlow / SHOVE_SLOW) : 1);   // still reeling from a shove
        moveCircle(z, ax / al * sp, az / al * sp, z.T.r);
        z.face += angDiff(Math.atan2(ax, az), z.face) * Math.min(1, dt * (z.type === 'runner' ? 7 : z.type === 'brute' ? 3.5 : 5));
      } else z.face += angDiff(Math.atan2(dxp, dzp), z.face) * Math.min(1, dt * 6);
      if (t.dead) { if (dp < z.T.r + 0.6 && z.atk <= 0 && z.stagger <= 0) { z.atk = rr(0.8, 1.2); z.lunge = 1; netLunge(z, null); } }   // and claw at you once they reach you
      else if (dp < z.T.r + 0.55 && z.atk <= 0 && z.stagger <= 0 && !reachBlocked(z.x, z.z, t.x, t.z)) {
        z.atk = 1.05; z.lunge = 1;
        if (t.me) { zStrike(z, armMul); netLunge(z, null); }
        else netLunge(z, t.id, armMul);   // a teammate: their game takes the blow (net/sync.js)
        if (z.dead) continue;
      }
    }
    // they don't block each other: a crowd pours through a doorway or a broken window and floods the room. Where they
    // bunch up they only drift apart a little (SPREAD, metres a second at full overlap), so they don't all stand in one
    // spot, and not at all in a window or a doorway or the cells round one, where it would only hold them up
    if (!pup && !z.out && !nearOpening(i, j)) for (const o2 of zombies) {
      if (o2 === z || o2.vault || o2.out) continue; const sx = z.x - o2.x, sz = z.z - o2.z, sd = Math.hypot(sx, sz), md = z.T.r + o2.T.r;
      if (sd < md && sd > 0.001) { const k = (1 - sd / md) * SPREAD * dt / sd; moveCircle(z, sx * k, sz * k, z.T.r); }
    }
    { const ex = P.x - z.x, ez = P.z - z.z; if (!P.vault && !P.dead && dme < z.T.r + 0.3 && dme > 0.001) { const push = (z.T.r + 0.3 - dme) * 0.5; moveCircle(P, ex / dme * push, ez / dme * push, 0.3, true); } }
    if (z.hp < z.maxHp * 0.5) { z.drip -= dt; if (z.drip <= 0) { z.drip = rr(0.4, 0.9); splat(z.x + rr(-.15, .15), z.z + rr(-.15, .15), 'drop', rr(0.15, 0.3)); } }
    // a leg gone: it buckles and goes down onto its hands (zombies/zombie-anim.js), hitting the ground about 60% of the
    // way through
    if (z.crawl && z.crawlT < 1) {
      const t0 = z.crawlT; z.crawlT = Math.min(1, z.crawlT + dt / 0.8);
      if (t0 < 0.62 && z.crawlT >= 0.62) {
        burst(z.x + Math.sin(z.face) * 0.9, 0.1, z.z + Math.cos(z.face) * 0.9, 6, 'dust', Math.sin(z.face), Math.cos(z.face), 1.2);
        soundAt(z.x, z.z, () => SFX.thud()); if (dme < 6) shake = Math.max(shake, 0.06);
      }
    } else if (z.crawl && (z.tx === undefined || Math.hypot(z.x - z.tx, z.z - z.tz) > 0.38)) { z.tx = z.x; z.tz = z.z; splat(z.x - Math.sin(z.face) * 0.2, z.z - Math.cos(z.face) * 0.2, 'drop', rr(0.22, 0.34)); }   // dragging itself along, leaving a smear
    if (z.blob) { const c = z.crawl ? 0.5 : 0; z.blob.position.set(z.x + Math.sin(z.face) * c, 0.02, z.z + Math.cos(z.face) * c); z.blob.scale.set(1.1 * z.T.scale * (z.type === 'brute' ? 1.25 : 1), 1, 1.1 * z.T.scale * (z.crawl ? 1.8 : 1)); z.blob.rotation.y = z.face; }
    animateZombie(z, dt, dp, relP); zFlash(z, dt);
  }
  if (phase === 'wave' && !spawnQ.length && zombies.length && zombies.length <= 3) for (const z of zombies) if (!z.redOl && !z.dead) z.redOl = outline(z.m.g, 0, 0, 0.04, rimMat(0xe0281c));
  if (zHitMe) zStruckFx();
  playerChecks();
  groanT -= dt; if (groanT <= 0 && nearest < 30) { soundAt(nearZ.x, nearZ.z, () => SFX.groan(clamp(1 - nearest / 16, 0.1, 1)), true); groanT = rr(1.5, 4); }
}
// a zombie's swing landing on you: the damage, the tilt toward it, and what it does by kind: a brute's knocks you back
// concussed, a crawler's trips you, the rest can open a bleed. In co-op a swing at you from the host's zombie comes here
// from its message (net/sync.js)
let zHitMe = false;
function zStrike(z, armMul) {
  const dxp = P.x - z.x, dzp = P.z - z.z, dp = Math.hypot(dxp, dzp);
  P.hitFrom = z.face; hitFromAt(z.x, z.z);
  P.hp -= z.T.dmg * armMul * (z.crawl ? 0.25 : 1) * S.dmgTaken; zHitMe = true; interruptBandage();   // a crawler only gets a weak swipe in, but it trips you
  // tilt the view toward whoever hit you
  const side = (-dxp * RIGHT.x - dzp * RIGHT.z) >= 0 ? 1 : -1; camRoll = clamp(camRoll - side * 0.055, -0.1, 0.1);
  camKick.x -= dxp / (dp || 1) * -0.25; camKick.z -= dzp / (dp || 1) * -0.25;
  if (z.type === 'brute') {   // concussed: knocked back, ears ringing, the world swims
    P.conc = 1; P.kbx = dxp / (dp || 1) * 7.5; P.kbz = dzp / (dp || 1) * 7.5; P.stun = 0.7; P.slow = Math.min(1, P.slow + 0.4);
    SFX.concuss(); shake = Math.max(shake, 0.6); camRoll = clamp(camRoll - side * 0.06, -0.14, 0.14);
    burst(P.x, 0.1, P.z, 10, 'dust', dxp, dzp, 2); $('conc').classList.remove('on'); void $('conc').offsetWidth; $('conc').classList.add('on');
  } else if (z.crawl) {   // a crawler grabs at your ankles: you stumble, but it can't bite deep enough to make you bleed
    const k = 1 - S.slowRes; P.slow = Math.min(1, P.slow + 0.85 * k); P.stun = 0.45 * k;
    P.kbx = -dzp / (dp || 1) * side * 2.2 + dxp / (dp || 1) * 1.2; P.kbz = dxp / (dp || 1) * side * 2.2 + dzp / (dp || 1) * 1.2;
    ANIM.stumble = 1; ANIM.stumbleSide = side; camRoll = clamp(camRoll - side * 0.07, -0.14, 0.14); shake = Math.max(shake, 0.3);
  } else if (rand() < 0.35) P.bleed = Math.min(14, (P.bleed || 0) + 6);   // a bite that opens you up
  if (!z.crawl) { P.slow = Math.min(1, P.slow + 0.6 * (1 - S.slowRes)); P.stun = 0.22 * (1 - S.slowRes); }
}
function zStruckFx() {
  zHitMe = false; if (P.dead) return;
  addBlood(0.05); ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1; SFX.hurt(); shake = Math.max(shake, 0.22); burst(P.x, 1, P.z, 6, 'blood'); if (rand() < 0.5) splat(P.x, P.z, 'drop', rr(.2, .35));
}
// your health, after whatever hit you this frame: Second wind once a wave below a quarter, and going down at none
function playerChecks() {
  if (S.secondWind && !S.windUsed && P.hp > 0 && P.hp < S.maxHp * 0.25) { S.windUsed = true; P.hp = Math.min(S.maxHp, P.hp + 50); P.slow = 0; feed('med', 50, 'second wind'); SFX.upgrade(); }
  if (P.hp <= 0 && !P.dead) { P.hp = 0; startDeath(); }
}
