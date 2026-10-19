// The brute's dash: from wave BDASH.wave on, now and then a brute that can see you from a way off plants itself and
// charges, to close the gap. It shows it coming: it drops into a crouch and a red stripe on the ground marks the line
// it will take (BDASH.wind seconds, a brighter fill running down the stripe toward you as the moment comes), then it
// thunders along that line at BDASH.speed. The line's set when the crouch starts, so stepping out of the stripe is the
// way to dodge it. Caught in it, you're slammed: damage, a hard knock along the line, stunned and concussed (dashHit).
// A shove or a heavy stagger during the crouch breaks it off. The host's game runs it; joiners see the crouch and the
// stripe ('zdw') and take the hit if it's at them ('zdh': net/sync.js).

// wave: the first wave it can happen; min, max: how far off you must be (metres); rate: the chance a second of starting
// one while it can; cd: the wait after one (seconds); wind: the crouch; speed, over: how fast it goes, and how far past
// where you stood; rec: the stumble to a halt after; w: the stripe's width; dmg, stun, kb: what it does to you
const BDASH = { wave: 8, min: 4.5, max: 8, rate: 0.09, cd: [9, 15], wind: 0.95, speed: 11, over: 2.5, rec: 0.8, w: 1.15, dmg: 42, stun: 1.1, kb: 10 };
// running into a wall: stunned for stun seconds (reeling, its head lolling), a cloud of dust and smoke thrown up off the
// wall, and the view shaken by up to shake, in full within near metres and trailing off to nothing at far
const BDASH_WALL = { stun: 2.4, shake: 0.95, near: 5, far: 16 };
// the stripe is drawn by a shader (DASH_VS, DASH_FS): a soft red lane with brighter edges, chevrons streaming along it
// the way it'll come, an arrow point at the far end, and a fill that runs out from the brute as the crouch counts down.
// It unrolls out of the brute's feet (grow) as it widens in with a little overshoot, flashes as the charge starts,
// is eaten up behind the brute as it goes (tail), and fades once it's done
const DASH_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DASH_FS = `uniform float uLen, uGrow, uFill, uTail, uAlpha, uTime, uFlash; uniform vec3 uCol; varying vec2 vUv;
void main() {
  float s = (1.0 - vUv.y) * uLen;                                            // metres out from the brute
  float tip = clamp((uLen - s) / 1.1, 0.0, 1.0), e = abs(vUv.x - 0.5) * 2.0 / max(tip, 0.001);   // across the lane, narrowing to the point
  if (e > 1.0) discard;
  float shown = (1.0 - smoothstep(uGrow * uLen - 0.4, uGrow * uLen, s)) * smoothstep(uTail, uTail + 0.8, s) * smoothstep(0.0, 0.6, s);
  float edge = smoothstep(0.66, 0.84, e) * (1.0 - smoothstep(0.9, 1.0, e)), body = 0.2 * (1.0 - smoothstep(0.84, 1.0, e));
  float filled = 1.0 - smoothstep(uFill * uLen - 0.35, uFill * uLen, s);
  float c = fract(s / 0.85 + e * 0.42 - uTime * 1.7), chev = smoothstep(0.0, 0.07, c) * (1.0 - smoothstep(0.2, 0.3, c)) * (1.0 - smoothstep(0.55, 0.75, e));
  float a = body + edge * 0.85 + chev * (0.22 + 0.5 * filled) + filled * 0.22 + uFlash * 0.5;
  vec3 col = mix(uCol, vec3(1.0, 0.78, 0.55), clamp(chev * filled * 0.6 + edge * 0.15 + uFlash * 0.6, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * shown * uAlpha);
}`;
const DASH_GEO = (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.5); return g; })();   // 1 × 1, from its origin along +z
const dashMarks = [];
const easeOut = t => 1 - Math.pow(1 - t, 3), easeBack = t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
// how far a dash can run from (x, z) along (dx, dz) before a wall, a fence, a tall prop, a window or a boarded door stops it
function dashRoom(x, z, dx, dz, L) {
  L = Math.max(0, thinRay(x, z, dx, dz, L + 0.25) - 0.25);   // an inside wall (world/thin-walls.js)
  for (let t = 0.25; t < L; t += 0.2) { const px = x + dx * t, pz = z + dz * t, i = ci(px), j = ci(pz); if (!inb(i, j) || bulletBlocked(px, pz) || cell[idx(i, j)] === FENCE || hardBlocked(i, j)) return t - 0.25; const o = openAt[idx(i, j)]; if (o && (o.kind === 'window' || o.boards.length)) return t - 0.25; }
  return L;
}
// the stripe on the ground for the dash d
function dashMark(z, d, x, zz) {
  const mat = new THREE.ShaderMaterial({ vertexShader: DASH_VS, fragmentShader: DASH_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { uLen: { value: d.L }, uGrow: { value: 0 }, uFill: { value: 0 }, uTail: { value: -1 }, uAlpha: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uCol: { value: new THREE.Color(0xe0261a) } } });
  const mesh = new THREE.Mesh(DASH_GEO, mat);
  mesh.scale.set(0.001, 1, d.L); mesh.position.set(x, surfaceY(x, zz) + 0.03, zz); mesh.rotation.y = Math.atan2(d.dx, d.dz); mesh.renderOrder = 2; scene.add(mesh);
  dashMarks.push({ z, d, mesh, mat, t: 0, out: 0, flash: 0 });
}
function stepDashMarks(dt) {
  for (let k = dashMarks.length - 1; k >= 0; k--) {
    const m = dashMarks[k], d = m.d, u = m.mat.uniforms; m.t += dt;
    // done with: the charge over, broken off, or the brute gone; it fades out over a fifth of a second
    if (d.cut || d.ph === 'rec' || m.z.dead || !zombies.includes(m.z) || m.z.dash !== d) m.out += dt;
    const fade = 1 - Math.min(1, m.out / (d.cut || m.z.dead ? 0.15 : 0.3));
    if (fade <= 0) { scene.remove(m.mesh); m.mat.dispose(); dashMarks.splice(k, 1); continue; }
    if (d.ph === 'go' && !m.flash) m.flash = 1;   // the moment it goes: a flash down the whole lane
    const w = easeBack(Math.min(1, m.t / 0.24));
    m.mesh.scale.x = Math.max(0.001, BDASH.w * w);
    u.uGrow.value = easeOut(Math.min(1, m.t / 0.32));
    u.uFill.value = d.ph === 'wind' ? Math.min(1, d.t / BDASH.wind) : 1;
    u.uTail.value = d.ph === 'wind' ? -1 : d.gone - 1.2;
    u.uTime.value = m.t; u.uFlash.value = m.flash > 0 ? Math.max(0, 1 - (m.t - (m.flashAt ??= m.t)) / 0.25) : 0;
    u.uAlpha.value = fade * Math.min(1, m.t / 0.12) * (d.ph === 'wind' ? 0.82 + 0.18 * Math.sin(m.t * 16) : 1);
  }
}
// the brute's skin glows hot red as it gathers itself, quickening and brightening toward the charge (on top of
// zFlash's, in zombies/ai.js)
function dashGlow(z) {
  const d = z.dash; if (!d || z.flash > 0) return;
  const k = d.ph === 'wind' ? Math.min(1, d.t / BDASH.wind) : d.ph === 'go' ? 1 : Math.max(0, 1 - d.t / 0.4);
  const p = d.ph === 'wind' ? 0.6 + 0.4 * Math.sin(d.t * (10 + 18 * k)) : 0.85, e = 0.04 + 0.2 * k * p;
  for (const mt of Object.values(z.m.mats)) mt.emissive.setRGB(e, e * 0.1, e * 0.05);
}
const dashCan = () => run.wave >= BDASH.wave;
// a brute that might start one (the host's game, or alone): far enough off, a clear line to you, not busy
function dashMaybe(z, dt, t, dp) {
  if (z.type !== 'brute' || !dashCan() || z.dash || z.crawl || z.out || z.vault || z.atkBoard || z.atkDoor || t.dead || z.stagger > 0 || !z.limbs.legL || !z.limbs.legR) return false;
  if (z.dashCd === undefined) z.dashCd = rr(3, 7);
  z.dashCd -= dt; if (z.dashCd > 0 || dp < BDASH.min || dp > BDASH.max || rand() > BDASH.rate * dt) return false;
  const dx = (t.x - z.x) / dp, dz = (t.z - z.z) / dp, room = dashRoom(z.x, z.z, dx, dz, dp + BDASH.over);
  if (room < dp) return false;   // something in the way: it can't see you, or it'd hit it first
  dashStart(z, dx, dz, room); netSend('zdw', { id: z.id, dx: nr(dx), dz: nr(dz), L: nr(room) });
  return true;
}
function dashStart(z, dx, dz, L) {
  z.dash = { ph: 'wind', t: 0, dx, dz, L, gone: 0, hit: new Set() }; z.face = Math.atan2(dx, dz);
  dashMark(z, z.dash, z.x, z.z); soundAt(z.x, z.z, () => SFX.groan(1), true);
}
// the dash under way; true while it's taking the brute over (its pathing and swings wait). A joiner's copy (pup) only
// plays the pose and the timing: where it goes comes with the host's snapshots
function dashStep(z, dt, pup) {
  const d = z.dash; if (!d) return false;
  d.t += dt;
  if (d.ph === 'wind') {
    z.face += angDiff(Math.atan2(d.dx, d.dz), z.face) * Math.min(1, dt * 10);
    if (!pup && (z.shoved > 0.3 || z.stagger > 0.25)) { d.cut = true; z.dash = null; z.dashCd = rr(BDASH.cd[0], BDASH.cd[1]) * 0.5; return false; }   // knocked out of it
    if (d.t >= BDASH.wind) { d.ph = 'go'; d.t = 0; soundAt(z.x, z.z, () => nz(0.22, 'lowpass', 300, 70, 0.5), true); }
    return true;
  }
  if (d.ph === 'go') {
    const step = Math.min(BDASH.speed * dt, d.L - d.gone);
    if (!pup) {
      const x0 = z.x, z0 = z.z; moveCircle(z, d.dx * step, d.dz * step, z.T.r); const moved = Math.hypot(z.x - x0, z.z - z0);
      d.gone += step;
      for (const q of netTargets()) {
        if (q.dead || d.hit.has(q.id || 'me')) continue;
        if (Math.hypot(q.x - z.x, q.z - z.z) < z.T.r + 0.45) { d.hit.add(q.id || 'me'); if (q.me) dashHit(z, d.dx, d.dz); else netSend('zdh', { id: z.id, h: q.id, dx: nr(d.dx), dz: nr(d.dz) }); }
      }
      if (moved < step * 0.4 && step > 0.01) { d.gone = d.L; d.wall = true; }   // ran into something
    } else d.gone += step;
    if (rand() < dt * 18) burst(z.x - d.dx * 0.4, 0.1, z.z - d.dz * 0.4, 1, 'dust', -d.dx, -d.dz, 1.4);
    if (d.gone >= d.L - 1e-3) {   // pulling up: it skids to a halt in a spray of dirt
      d.ph = 'rec'; d.t = 0; d.recT = d.wall ? BDASH_WALL.stun : BDASH.rec; { const r = d.wall ? z.T.r : 0; soundAt(z.x + d.dx * r, z.z + d.dz * r, () => d.wall ? SFX.bruteWall() : SFX.thud(), true); }   // (a crash from where it struck the wall: its own fall-off, SFX.bruteWall)
      const pd = Math.hypot(P.x - z.x, P.z - z.z);
      if (d.wall) { if (!P.dead) shake = Math.max(shake, BDASH_WALL.shake * (1 - smooth(clamp((pd - BDASH_WALL.near) / (BDASH_WALL.far - BDASH_WALL.near), 0, 1)))); dashWallFx(z, d); }
      else { shake = Math.max(shake, 0.25 * clamp(1 - pd / 10, 0, 1)); burst(z.x + d.dx * 0.5, 0.1, z.z + d.dz * 0.5, 9, 'dust', d.dx, d.dz, 2.2); }
    }
    return true;
  }
  if (d.t >= (d.recT || BDASH.rec)) { z.dash = null; z.dashCd = rr(BDASH.cd[0], BDASH.cd[1]); return false; }
  return true;
}
// slamming into a wall: dust and grit blown out off it and back along the run, a ring of it along the ground, and a slow
// cloud of smoke rolling up where it hit
function dashWallFx(z, d) {
  const wx = z.x + d.dx * z.T.r, wz = z.z + d.dz * z.T.r;
  burst(wx, 0.6, wz, 14, 'dust', -d.dx, -d.dz, 3); groundDust(wx, wz, 1, -d.dx, -d.dz);
  for (let k = 0; k < 18; k++) fx('smoke', wx + rr(-0.6, 0.6), rr(0.2, 1.8), wz + rr(-0.6, 0.6), -d.dx * rr(0.3, 1.4) + rr(-0.7, 0.7), rr(0.3, 1.2), -d.dz * rr(0.3, 1.4) + rr(-0.7, 0.7), rr(0.5, 0.8), rr(2, 3.2), rr(2, 3.2), rr(0.7, 0.9));
  for (let k = 0; k < 16; k++) fx('dust', wx + rr(-0.4, 0.4), rr(0.3, 1.9), wz + rr(-0.4, 0.4), -d.dx * rr(1, 2.8) + rr(-1.2, 1.2), rr(-0.2, 0.9), -d.dz * rr(1, 2.8) + rr(-1.2, 1.2), rr(0.3, 0.5), rr(1.1, 1.8), rr(1, 1.6), rr(0.6, 0.85));
}
// caught by it: a hit as hard as a brute's swing, flung along its line and out to the side you were on, stunned for
// a second and concussed
function dashHit(z, dx, dz) {
  const sx = P.x - z.x, sz = P.z - z.z, side = Math.sign(sx * dz - sz * dx) || 1;
  P.hitFrom = z.face; hitFromAt(z.x, z.z, 2.2); interruptBandage(); zHitMe = true;
  P.hp -= BDASH.dmg * waveDmg() * S.dmgTaken;
  P.kbx = (dx * 0.85 + dz * side * 0.5) * BDASH.kb; P.kbz = (dz * 0.85 - dx * side * 0.5) * BDASH.kb;
  P.conc = 1; P.stun = BDASH.stun; P.slow = Math.min(1, P.slow + 0.7); P.sprint = false; P.runUp = 0;
  SFX.concuss(); shake = Math.max(shake, 0.85); camRoll = clamp(camRoll + side * 0.1, -0.16, 0.16);
  burst(P.x, 0.1, P.z, 14, 'dust', dx, dz, 2.6); $('conc').classList.remove('on'); void $('conc').offsetWidth; $('conc').classList.add('on');
}
// a zombie's pose while it dashes (zombies/zombie-anim.js): crouched low and leaning in with the arms drawn back, then
// bent right over into the charge, then pulling up
function zDashPose(z, a, T, K) {
  const d = z.dash; if (!d) return;
  if (d.ph === 'wind') {
    // it sinks into a crouch, head down like a bull's, shoulders hunched and the fists drawn back; one foot paws the
    // ground twice; a tremble builds through it toward the charge
    const k = smooth(Math.min(1, d.t / 0.3)), u = Math.min(1, d.t / BDASH.wind), q = Math.sin(d.t * 34) * 0.045 * u * u;
    const paw = d.t > 0.25 && d.t < 0.85 ? Math.sin((d.t - 0.25) / 0.6 * Math.PI * 2) : 0;
    zMix(T, { y: -0.2, rx: 0.36 + q, ux: 0.5, uz: q * 0.6, hx: -0.5, hz: q, alx: 0.85, arx: 0.85, alz: 0.4, arz: -0.4, aly: -0.2, ary: 0.2, elL: -0.9, elR: -0.9,
      klx: 1.0, krx: 0.75 + 0.35 * Math.max(0, paw), llx: -0.6, lrx: -0.15 + 0.45 * paw }, k);
    zBoost(K, ['y', 'rx', 'ux', 'hx', 'klx', 'krx', 'lrx'], 1.8);
  } else if (d.ph === 'go') {
    // bent right over into it, the fists pumping against the legs' stride
    const sw = Math.sin(z.phase || 0) * 0.55;
    zMix(T, { y: -0.08, rx: 0.52, ux: 0.6, hx: -0.55, alx: 0.6 + sw, arx: 0.6 - sw, alz: 0.3, arz: -0.3, elL: -1.1, elR: -1.1 }, 0.9);
    zBoost(K, ['rx', 'ux', 'hx', 'alx', 'arx'], 2.4);
  } else {
    // the skid: thrown back on its heels, the arms out for balance, then it straightens and turns on
    const R = d.recT || BDASH.rec, j = Math.min(1, d.t / 0.15);
    if (!d.wall) { const k = 1 - smooth(Math.min(1, d.t / R)); zMix(T, { y: -0.12, rx: -0.22, ux: -0.25, hx: 0.2, alx: -0.9, arx: -0.9, alz: 0.55, arz: -0.55, klx: 0.6, krx: 0.6, llx: 0.35, lrx: 0.25 }, k * j); return; }
    // off a wall: knocked back off it, then stood reeling, slumped with the arms hanging and the head lolling round, till it
    // shakes it off over the last half second
    const back = 1 - smooth(clamp((d.t - 0.1) / 0.4, 0, 1)), daze = smooth(clamp((d.t - 0.15) / 0.35, 0, 1)) * (1 - smooth(clamp((d.t - (R - 0.5)) / 0.5, 0, 1))), w = d.t * 3.2;
    zMix(T, { y: -0.12, rx: -0.3, ux: -0.3, hx: 0.3, alx: -0.9, arx: -0.9, alz: 0.55, arz: -0.55, klx: 0.6, krx: 0.6, llx: 0.35, lrx: 0.25 }, back * j);
    zMix(T, { y: -0.1, rx: 0.25 + Math.sin(w * 0.7) * 0.06, ux: 0.3, uz: Math.sin(w * 0.5) * 0.12, hx: 0.45 + Math.sin(w) * 0.15, hz: Math.cos(w * 0.9) * 0.3, alx: 0.15, arx: 0.1, alz: 0.12, arz: -0.12, elL: -0.25, elR: -0.3, klx: 0.35, krx: 0.25 }, daze);
  }
}
// zombie hits harden as the waves go on: ZDMG_WAVE more a wave past the first (wave 10 about +27%, wave 20 +57%)
const ZDMG_WAVE = 0.03;
const waveDmg = () => 1 + ZDMG_WAVE * Math.max(0, (run.wave || 1) - 1);
