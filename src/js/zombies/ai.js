// Zombie AI, attacks on you, brute concussion and zombie animation.

// zombie AI, attacks, fence climbing and body animation
function updateZombies(dt) {
  let hitMe = false, nearest = 99;
  for (let k = zombies.length - 1; k >= 0; k--) {
    const z = zombies[k], m = z.m;
    if (z.vx || z.vz) { moveCircle(z, z.vx * dt, z.vz * dt, z.T.r); const f = Math.exp(-9 * dt); z.vx *= f; z.vz *= f; if (Math.abs(z.vx) + Math.abs(z.vz) < 0.02) z.vx = z.vz = 0; }
    const dxp = P.x - z.x, dzp = P.z - z.z, dp = Math.hypot(dxp, dzp);
    if (dp < nearest) nearest = dp;
    if (z.burn > 0) { z.burn -= dt; if (rand() < dt * 14) burst(z.x + rr(-.2, .2), rr(0.6, 1.5) * z.T.scale * (z.crawl ? 0.4 : 1), z.z + rr(-.2, .2), 1, 'ember', 0, 0, 0.2); z.hp -= 14 * dt; if (z.hp <= 0) { killZombie(z, -Math.sin(z.face), -Math.cos(z.face), 'fire', 'torso', 0); continue; } }
    if (z.bleed > 0) { z.bleed -= dt; z.hp -= 8 * dt; if (rand() < dt * 3) splat(z.x, z.z, 'drop', rr(0.12, 0.25)); if (z.hp <= 0) { killZombie(z, -Math.sin(z.face), -Math.cos(z.face), 'bleed', 'torso', 0); continue; } }
    for (let q = z.spurts.length - 1; q >= 0; q--) {
      const sp = z.spurts[q]; sp.t -= dt; if (sp.t <= 0) { z.spurts.splice(q, 1); continue; }
      if (rand() < 0.5) { const v = new V3(...STUMP[sp.part]); m.g.localToWorld(v); burst(v.x, Math.max(0.15, v.y), v.z, 1, 'blood', rr(-1, 1), rr(-1, 1), 0.8); }
    }
    if (z.vault) { stepZVault(z, dt); continue; }
    const fl = z.type === 'brute' ? distB : dist, i = ci(z.x), j = ci(z.z), here = inb(i, j) ? fl[idx(i, j)] : 1e9;
    const inWin = inb(i, j) && openAt[idx(i, j)] && openAt[idx(i, j)].kind === 'window';
    let tx = P.x, tz = P.z, attackingBoard = null;
    if (here > 1.6) {
      let bestD = here, bi = -1, bj = -1;
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj; if (!inb(ni, nj)) continue;
        if (di && dj && !diagOk(i, j, di, dj)) continue;
        const d = fl[idx(ni, nj)]; if (d < bestD) { bestD = d; bi = ni; bj = nj; }
      }
      if (bi >= 0 && cell[idx(bi, bj)] === FENCE && Math.hypot(cxw(bi) - z.x, cxw(bj) - z.z) < 0.85 + z.T.r) {
        // climb over: pick the cell on the far side the flow wants next
        let ei = -1, ej = -1, ed = 1e9;
        for (const [di, dj] of DIRS) { const ni = bi + di, nj = bj + dj; if (!inb(ni, nj) || hardBlocked(ni, nj) || (ni === i && nj === j)) continue; const d = fl[idx(ni, nj)]; if (d < ed) { ed = d; ei = ni; ej = nj; } }
        if (ei >= 0) { z.vault = { t: 0, x0: z.x, z0: z.z, fx: cxw(bi), fz: cxw(bj), x1: cxw(ei), z1: cxw(ej), dur: (z.crawl ? 2.6 : z.type === 'runner' ? 1.25 : z.type === 'brute' ? 2.4 : 1.9) * rr(0.9, 1.1), landed: false }; z.face = Math.atan2(cxw(ei) - z.x, cxw(ej) - z.z); if (Math.hypot(z.x - P.x, z.z - P.z) < 14) SFX.fenceClimb(); }
      }
      if (bi >= 0) { tx = cxw(bi); tz = cxw(bj); const op = openAt[idx(bi, bj)]; if (op && op.boards.length && Math.hypot(tx - z.x, tz - z.z) < 0.95 + z.T.r) attackingBoard = op; }
    }
    const arms = (z.limbs.armL ? 1 : 0) + (z.limbs.armR ? 1 : 0), armMul = arms === 2 ? 1 : arms === 1 ? 0.7 : 0.4;
    z.atk -= dt; z.lunge = Math.max(0, z.lunge - dt * 3); z.stagger -= dt; z.squash = Math.max(0, z.squash - dt * 8); z.pushSlow = Math.max(0, (z.pushSlow || 0) - dt); z.shoved = Math.max(0, (z.shoved || 0) - dt * 2.2);
    z.atkBoard = attackingBoard;
    if (attackingBoard) {
      z.face = Math.atan2(tx - z.x, tz - z.z);
      const top = attackingBoard.boards.length - 1;
      attackingBoard.boards[top] -= z.T.bdps * armMul * (z.crawl ? 0.5 : 1) * dt;
      if (z.atk <= 0) { z.atk = 0.9; z.lunge = 1; nz(0.08, 'lowpass', 700, 200, 0.18 * clamp(1 - dp / 18, 0, 1)); }
      if (attackingBoard.boards[top] <= 0) breakBoard(attackingBoard);
      z.phase += dt * 2;
    } else {
      const ax = tx - z.x, az = tz - z.z, al = Math.hypot(ax, az);
      if (al > 0.05 && !(dp < z.T.r + 0.5 && here <= 1.6)) {   // they keep closing in while you go down, right up until the world stops
        const sp = z.speed * dt * (z.stagger > 0 ? 0.25 : 1) * (inWin ? 0.4 : 1) * (z.crawl ? 0.32 : 1) * (z.pushSlow > 0 ? 0.45 + 0.55 * (1 - z.pushSlow / SHOVE_SLOW) : 1);   // still reeling from a shove
        moveCircle(z, ax / al * sp, az / al * sp, z.T.r);
        z.phase += dt * z.speed * (z.crawl ? 2.5 : z.type === 'runner' ? 3.6 : 4.5);
        z.face += angDiff(Math.atan2(ax, az), z.face) * Math.min(1, dt * 8);
      } else z.face += angDiff(Math.atan2(dxp, dzp), z.face) * Math.min(1, dt * 8);
      if (P.dead) { if (dp < z.T.r + 0.6 && z.atk <= 0 && z.stagger <= 0) { z.atk = rr(0.8, 1.2); z.lunge = 1; } }   // and claw at you once they reach you
      else if (dp < z.T.r + 0.55 && z.atk <= 0 && z.stagger <= 0 && !P.vault) {
        P.hitFrom = z.face;
        z.atk = 1.05; z.lunge = 1; P.hp -= z.T.dmg * armMul * (z.crawl ? 0.25 : 1) * S.dmgTaken;   // a crawler only gets a weak swipe in, but it trips you hitMe = true; interruptBandage();
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
        } else if (rand() < 0.35) { P.bleed = Math.min(14, (P.bleed || 0) + 6); }
        if (!z.crawl) { P.slow = Math.min(1, P.slow + 0.6 * (1 - S.slowRes)); P.stun = 0.22 * (1 - S.slowRes); }
        if (z.dead) continue;
      }
    }
    for (const o2 of zombies) {
      if (o2 === z) continue; const sx = z.x - o2.x, sz = z.z - o2.z, sd = Math.hypot(sx, sz), md = z.T.r + o2.T.r;
      if (sd < md && sd > 0.001) moveCircle(z, sx / sd * (md - sd) * 0.5, sz / sd * (md - sd) * 0.5, z.T.r);
    }
    if (!P.vault && dp < z.T.r + 0.3 && dp > 0.001) { const push = (z.T.r + 0.3 - dp) * 0.5; moveCircle(P, dxp / dp * push, dzp / dp * push, 0.3, true); }
    if (z.hp < z.maxHp * 0.5) { z.drip -= dt; if (z.drip <= 0) { z.drip = rr(0.4, 0.9); splat(z.x + rr(-.15, .15), z.z + rr(-.15, .15), 'drop', rr(0.15, 0.3)); } }
    const s = z.T.scale, sw = Math.sin(z.phase), sq = z.squash, run_ = z.type === 'runner';
    let crawlY = z.crawl ? 0.2 * s : 0;
    if (z.crawl && z.crawlT < 1) {
      const t0 = z.crawlT; z.crawlT = Math.min(1, z.crawlT + dt / 0.8); const t = z.crawlT;
      if (t0 < 0.62 && t >= 0.62) {   // hits the ground
        burst(z.x + Math.sin(z.face) * 0.9, 0.1, z.z + Math.cos(z.face) * 0.9, 6, 'dust', Math.sin(z.face), Math.cos(z.face), 1.2);
        splat(z.x + Math.sin(z.face) * 0.7, z.z + Math.cos(z.face) * 0.7, 'pool', rr(0.5, 0.75));
        SFX.thud(); if (Math.hypot(z.x - P.x, z.z - P.z) < 6) shake = Math.max(shake, 0.06);
      }
    }
    m.g.position.set(z.x, (inWin ? 0.25 : 0) + crawlY + (run_ && !z.crawl ? Math.abs(sw) * 0.05 : 0), z.z); m.g.rotation.y = z.face;
    if (z.blob) { const c = z.crawl ? 0.5 : 0; z.blob.position.set(z.x + Math.sin(z.face) * c, 0.02, z.z + Math.cos(z.face) * c); z.blob.scale.set(1.1 * z.T.scale * (z.type === 'brute' ? 1.25 : 1), 1, 1.1 * z.T.scale * (z.crawl ? 1.8 : 1)); z.blob.rotation.y = z.face; }
    m.g.scale.set(s * (1 + sq * 0.06), s * (1 - sq * 0.08), s * (1 + sq * 0.06));
    if (z.crawl && z.crawlT < 1) {
      // buckle on the stump, pitch forward, slap down onto the hands and settle
      const t = z.crawlT;
      let rx, y;
      if (t < 0.25) { const k = smooth(t / 0.25); rx = 0.3 * k; y = -0.2 * k; }
      else if (t < 0.62) { const k = (t - 0.25) / 0.37; rx = 0.3 + 1.12 * k * k; y = -0.2 + (0.2 * s + 0.2) * k; }
      else { const k = (t - 0.62) / 0.38; rx = 1.18 + 0.24 * Math.cos(k * Math.PI * 1.5) * (1 - k); y = 0.2 * s; }
      m.g.rotation.x = rx; m.g.position.y = (inWin ? 0.25 : 0) + y;
      const reach = t < 0.25 ? -0.6 - 1.2 * smooth(t / 0.25) : t < 0.62 ? -1.8 + 0.2 * Math.sin(t * 30) : -1.6 + 0.3 * (t - 0.62);
      m.armL.rotation.x = reach; m.armR.rotation.x = reach + 0.15;
      m.legL.rotation.x = t < 0.4 ? 0.5 * smooth(t / 0.4) : 0.5 - 0.35 * (t - 0.4); m.legR.rotation.x = m.legL.rotation.x * 0.6;
      m.head.rotation.x = -0.25 * t; m.upper.rotation.set(0, 0, Math.sin(t * 12) * 0.12 * (1 - t));
    } else if (z.crawl) {
      // drag themselves along, head up, leaving a smear
      m.g.rotation.x = 1.18;
      m.legL.rotation.x = 0.15 + sw * 0.12; m.legR.rotation.x = 0.15 - sw * 0.12;
      m.armL.rotation.x = -1.35 + Math.sin(z.phase) * 0.6 - z.lunge * 0.3; m.armR.rotation.x = -1.35 - Math.sin(z.phase) * 0.6 - z.lunge * 0.3;
      m.head.rotation.x = -0.5;
      m.upper.rotation.x = 0; m.upper.rotation.z = Math.sin(z.phase) * 0.1;
      if (z.tx === undefined || Math.hypot(z.x - z.tx, z.z - z.tz) > 0.38) { z.tx = z.x; z.tz = z.z; splat(z.x - Math.sin(z.face) * 0.2, z.z - Math.cos(z.face) * 0.2, 'drop', rr(0.22, 0.34)); }
    } else {
      m.g.rotation.x = run_ ? 0.18 : 0;
      const stride = run_ ? 0.95 : 0.55;
      m.legL.rotation.x = sw * stride; m.legR.rotation.x = -sw * stride;
      if (run_) { m.armL.rotation.x = -0.4 - sw * 0.7 - z.lunge * 0.5; m.armR.rotation.x = -0.4 + sw * 0.7 - z.lunge * 0.5; }
      else { m.armL.rotation.x = -0.2 + Math.sin(z.phase * 0.5) * 0.12 - z.lunge * 0.5; m.armR.rotation.x = -0.15 - Math.sin(z.phase * 0.5) * 0.12 - z.lunge * 0.5; }
      m.upper.rotation.x = 0.12 + z.lunge * 0.25 - sq * 0.25; m.upper.rotation.z = Math.sin(z.phase * 0.5) * 0.06;
    }
    // thrown back by a shove: rocked onto the heels with the arms flung up, easing out
    if (z.shoved > 0 && !z.crawl) { const k = Math.sin(Math.min(1, z.shoved) * Math.PI * 0.5); m.g.rotation.x -= k * 0.22; m.upper.rotation.x -= k * 0.55; m.head.rotation.x = -k * 0.35; m.armL.rotation.x -= k * 0.7; m.armR.rotation.x -= k * 0.55; }
    z.flash = Math.max(0, z.flash - dt);
    // a hit flashes the body white-hot, cooling through red as the flash runs out
    if (z.flash > 0) { const k = z.flash / 0.14; for (const mt of [m.mats.skin, m.mats.shirt, m.mats.pants]) mt.emissive.setRGB(0.35 + 0.6 * k, 0.1 + 0.55 * k, 0.07 + 0.45 * k); }
    else { const e = z.burn > 0 ? (rand() < 0.5 ? 0x8a3a08 : 0x5a2004) : 0x000000; m.mats.skin.emissive.setHex(e); m.mats.shirt.emissive.setHex(e); m.mats.pants.emissive.setHex(e); }
  }
  if (phase === 'wave' && !spawnQ.length && zombies.length && zombies.length <= 3) for (const z of zombies) if (!z.redOl && !z.dead) z.redOl = outline(z.m.g, 0, 0, 0.04, rimMat(0xe0281c));
  if (hitMe && !P.dead) { addBlood(0.05); ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1; SFX.hurt(); hurtFx = 1; shake = Math.max(shake, 0.22); burst(P.x, 1, P.z, 6, 'blood'); if (rand() < 0.5) splat(P.x, P.z, 'drop', rr(.2, .35)); }
  if (S.secondWind && !S.windUsed && P.hp > 0 && P.hp < S.maxHp * 0.25) { S.windUsed = true; P.hp = Math.min(S.maxHp, P.hp + 50); P.slow = 0; feed('med', 50, 'second wind'); SFX.upgrade(); }
  if (P.hp <= 0 && !P.dead) { P.hp = 0; startDeath(); }
  groanT -= dt; if (groanT <= 0 && nearest < 30) { SFX.groan(clamp(1 - nearest / 16, 0.1, 1)); groanT = rr(1.5, 4); }
}
