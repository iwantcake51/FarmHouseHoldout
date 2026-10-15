// Co-op: keeping every player's farm the same. The host's game runs the zombies (where they go, who they swing at,
// the boards they tear down), the waves and the clock, and sends where everything is a dozen times a second; on a
// joiner's screen each zombie is the host's, eased to where it is there and animated here (updateZombies,
// zombies/ai.js). A spawn comes with its seed, so each zombie is built alike everywhere (withSeed, core/math.js).
// Hits are the hitter's: whoever lands one works out what it does (the damage, what comes off, whether it dies and how
// it falls, what it drops) and sends that, as it happened, for everyone else to play out the same (netAct).
// Your survivor is yours alone: your health, your guns, your scrap and your cards; the others see your pose
// (net/avatars.js) and are told when you board a window or pick up a drop.

let NREC = null, NREP = null;   // a hit of yours being written down to send; a teammate's being played out
const NZ = new Map();           // zombies by the id the host gave them
let zSeq = 0, dropSeq = 0, snapT = 0, overT = 0, downTold = false;
const nr = v => Math.round(v * 100) / 100;
const netTeam = () => netLink() ? 1 + NET.peers.size : 1;
// whoever's left standing: you, and in co-op your teammates (their latest pose: where they are, whether they're down)
const ME = { me: true, x: 0, z: 0, dead: false, vault: false, id: '' }, TG = [];
function netTargets() {
  ME.x = P.x; ME.z = P.z; ME.dead = !!P.dead; ME.vault = !!P.vault; ME.id = NET.id;
  TG.length = 0; TG.push(ME);
  if (netLink()) for (const p of NET.peers.values()) if (p.x !== undefined) TG.push(p);
  return TG;
}
const netAllDown = () => netTargets().every(q => q.dead);

// ---- zombies coming in: the host's seed, so the same one comes in everywhere
function netSpawn(type) {
  if (!netLink()) return spawnZombie(type);
  const s = (Math.random() * 4294967296) >>> 0, id = ++zSeq;
  withSeed(s, () => spawnZombie(type)); const z = zombies[zombies.length - 1]; z.id = id; NZ.set(id, z);
  netSend('zs', { id, ty: type, s, wv: run.wave });
}
NET_ON.zs = m => {
  if (NET.host || !netLink()) return;
  const wv = run.wave; run.wave = m.wv;
  withSeed(m.s, () => spawnZombie(m.ty)); run.wave = wv;
  const z = zombies[zombies.length - 1]; z.id = m.id; NZ.set(m.id, z); z.nx = z.x; z.nz = z.z; z.nf = z.face;
};
// a climb over a fence or in at a window starts on the host: the same climb (its seed) plays out here
function startClimb(z, kind, fx, fz, dx, dz, x1, z1, o) {
  if (!netLink() || !NET.host || !z.id) return startClimb0(z, kind, fx, fz, dx, dz, x1, z1, o);
  const s = (Math.random() * 4294967296) >>> 0;
  withSeed(s, () => startClimb0(z, kind, fx, fz, dx, dz, x1, z1, o));
  netSend('zc', { id: z.id, k: kind, fx: nr(fx), fz: nr(fz), dx: nr(dx), dz: nr(dz), x1: nr(x1), z1: nr(z1), o: o ? openings.indexOf(o) : -1, s });
}
NET_ON.zc = m => { const z = NZ.get(m.id); if (!z || z.dead || NET.host) return; withSeed(m.s, () => startClimb0(z, m.k, m.fx, m.fz, m.dx, m.dz, m.x1, m.z1, openings[m.o] || null)); };

// ---- where the host has everything, a dozen times a second
function snapOut(rdt) {
  snapT -= rdt; if (snapT > 0) return; snapT = 1 / 12;
  const zs = [];
  for (const z of zombies) if (z.id && !z.dead) zs.push(z.id, nr(z.x), nr(z.z), nr(z.face), Math.round(z.hp), z.out ? 1 : 0, z.atkBoard ? openings.indexOf(z.atkBoard) + 1 : 0);
  netSend('w', { td: nr(tod), bt: nr(breakT), bm: breakMax, sq: spawnQ.length, z: zs, b: openings.map(o => o.boards.map(h => Math.round(h))) });
}
NET_ON.w = m => {
  if (NET.host || !netLink()) return;
  if (Math.abs(angDiff(m.td / 24 * 6.2832, tod / 24 * 6.2832)) > 0.02) tod = m.td; else tod += (m.td - tod) * 0.3;
  if (phase === 'break') { breakT = m.bt; breakMax = m.bm; }
  if (spawnQ.length !== m.sq) spawnQ = new Array(m.sq).fill('walker');
  const now = performance.now(), zs = m.z;
  for (let k = 0; k < zs.length; k += 7) {
    const z = NZ.get(zs[k]); if (!z || z.dead) continue;
    z.nx = zs[k + 1]; z.nz = zs[k + 2]; z.nf = zs[k + 3]; z.seen = now;
    if (zs[k + 4] < z.hp) z.hp = zs[k + 4];
    z.out = !!zs[k + 5]; z.atkBoard = zs[k + 6] ? openings[zs[k + 6] - 1] : null;
  }
  // the boards: how many on each opening and how worked loose they are (the host's word for it, unless one went up or
  // came down here a moment ago and the host hasn't caught up yet)
  m.b.forEach((hb, k) => {
    const o = openings[k]; if (!o || now < (o.netT || 0)) return;
    while (o.boards.length > hb.length) breakBoard(o, null);
    while (o.boards.length < hb.length) addBoard(o, hb[o.boards.length], 1);
    hb.forEach((h, q) => { o.boards[q] = h; });
  });
};
// a joiner's zombie each frame: eased to where the host has it (a climb plays out on its own here, from its start)
function puppetMove(z, dt) {
  if (z.vault || z.nx === undefined) return;
  const k = 1 - Math.exp(-dt * 11), dx = z.nx - z.x, dz = z.nz - z.z;
  if (dx * dx + dz * dz > 9) { z.x = z.nx; z.z = z.nz; } else { z.x += dx * k; z.z += dz * k; }
  z.face += angDiff(z.nf, z.face) * k;
}
// and at the boards the host says it's tearing at: a blow each beat, the plank jumping, a little dust
function puppetBoard(z, dme) {
  const o = z.atkBoard; if (!o || !o.boards.length) return;
  z.face += angDiff(Math.atan2(o.x - z.x, o.z - z.z), z.face) * 0.2;
  if (z.atk <= 0) { z.atk = 0.9; z.lunge = 1; nz(0.08, 'lowpass', 700, 200, 0.18 * clamp(1 - dme / 18, 0, 1)); boardJolt(o, z); }
}
// a swing from the host's zombie: everyone sees it lunge, and if it was at you, it lands on you
function netLunge(z, at, armMul) { if (netLink() && z.id) netSend('za', { id: z.id, h: at || '', am: armMul || 1 }); }
NET_ON.za = m => {
  const z = NZ.get(m.id); if (!z || z.dead) return;
  if (!NET.host) { z.atk = 1.05; z.lunge = 1; }
  if (m.h === NET.id && !P.dead && state !== 'title') { zStrike(z, m.am); zStruckFx(); }
};

// ---- hits: written down as they happen here, played out the same everywhere else
function netRec(...op) { if (NREC) NREC.ops.push(op); }
function netHitRec(z, dealt, part, kb, wId) { if (NREC) NREC.ops.push(['d', nr(dealt), part, nr(kb), wId, nr(z.burn || 0), nr(z.bleed || 0), nr(z.bleedR || 0), part !== 'torso' && part !== 'head' ? nr(z.lhp[part]) : 0]); }
function netAct(z, dx, dz, fn) {
  if (!netLink() || NREP || NREC || !z.id) return fn();
  NREC = { ops: [] }; const np = pickups.length; let r;
  try { r = fn(); } finally {
    const ops = NREC.ops; NREC = null;
    if (ops.length) {
      // and what it dropped, each with an id of its own so whoever picks it up can say so
      const dr = [];
      for (let k = np; k < pickups.length; k++) { const p = pickups[k]; if (p.nid) continue; p.nid = NET.id + '.' + (++dropSeq); p.own = true; dr.push([p.nid, p.kind, p.amount, p.ammoType || '', nr(p.x), nr(p.z), p.hoard ? 1 : 0]); }
      netSend('hit', { id: z.id, dx: nr(dx), dz: nr(dz), ops, dr });
    }
  }
  return r;
}
NET_ON.hit = m => {
  const z = NZ.get(m.id);
  if (z && !z.dead && state !== 'title') {
    NREP = m;
    try { for (const op of m.ops) netOp(z, op, m.dx, m.dz); if (z.dead) killEnd(z); }
    catch (e) { console.error('net hit', e); }
    finally { NREP = null; }
    if (m.dr) for (const d of m.dr) { dropPickup(d[4], d[5], d[1], d[2], d[3] || undefined); const p = pickups[pickups.length - 1]; p.nid = d[0]; if (d[6]) p.hoard = true; }
  }
};
function netOp(z, op, dx, dz) {
  switch (op[0]) {
    case 'd': {   // the hit itself, and what it left burning or bleeding
      const [, dl, part, kb, w, burn, bleed, bleedR, lhp] = op, D = W(w) || EFF[w] || WEAP[w] || {};
      if (z.dead) return;
      hitFx(z, dl, dx, dz, kb, w, part, D);
      z.burn = Math.max(z.burn || 0, burn); z.bleed = Math.max(z.bleed || 0, bleed); z.bleedR = Math.max(z.bleedR || 0, bleedR);
      if (lhp && z.lhp[part] > lhp) z.lhp[part] = lhp;
      return;
    }
    case 's': sever(z, op[1], dx, dz, !!op[2]); return;
    case 'l': severLower(z, op[1], dx, dz); return;
    case 'c': crushHead(z, dx, dz); return;
    case 'p': splitHead(z, dx, dz); return;
    case 'h': headShot(z, dx, dz); return;
    case 'b': blowApart(z, dx, dz); return;
    case 'k': z.killW = op[1]; killZombie0(z, dx, dz, op[1], op[2], 0); return;
    case 'r': makeRagdoll(z, dx, dz, op[1], op[2], z.killW); if (op[3]) ragdolls[ragdolls.length - 1].neck = NECK_PUMP; return;
    case 'v': shoveZombie(z, dx, dz, op[1], op[2], !!op[3]); return;
  }
}
// a drop someone picked up: gone from everyone's farm
NET_ON.pt = m => { const k = pickups.findIndex(p => p.nid === m.n); if (k >= 0) { scene.remove(pickups[k].g); pickups.splice(k, 1); } };
// a blast somewhere: the bang and the fire (the damage is the thrower's, in their hits)
NET_ON.boom = m => { if (state !== 'title') explode(m.x, m.z, m.r, 0, false, true); };
NET_ON.nade = m => { if (state === 'title') return; const g = m.g; grenades.push({ m: box(scene, 0.12, 0.12, 0.18, GM.olive, g[0], GUN_Y, g[1]), x0: g[0], z0: g[1], x1: g[2], z1: g[3], t: 0, dur: g[4], h: g[5], net: true }); };

// ---- boards: whoever puts one up says so; the host says when a zombie tears one down
function netBoardUp(o) {
  if (!netLink()) return;
  o.netT = performance.now() + 1500;
  netSend('ba', { o: openings.indexOf(o), hp: Math.round(o.boards[o.boards.length - 1]), sd: Math.sign((P.x - o.x) * o.nx + (P.z - o.z) * o.nz) || 1 });
}
NET_ON.ba = m => { const o = openings[m.o]; if (!o || state === 'title' || o.boards.length >= 3) return; o.netT = performance.now() + 1500; addBoard(o, m.hp, m.sd); };
function netBoardBroke(o, z) { if (netLink() && NET.host) { o.netT = performance.now() + 600; netSend('bb', { o: openings.indexOf(o), id: z ? z.id : 0 }); } }
NET_ON.bb = m => { const o = openings[m.o]; if (!o || NET.host || !o.boards.length) return; o.netT = performance.now() + 1500; const z = NZ.get(m.id); breakBoard(o, z || null); if (z && z.an) z.an.rip = 1; };

// ---- the waves: the host's start them, clear them and runs the breaks
NET_ON.wave = m => { if (NET.host || !netLink() || state === 'title') return; waveBegins(m.n, m.tot); spawnQ = new Array(m.tot).fill('walker'); };
NET_ON.clear = () => { if (NET.host || !netLink() || state === 'title' || phase === 'cleared') return; waveCleared(); };
NET_ON.skip = () => { if (NET.host && phase === 'break') breakT = 0; };
// wave cleared: everyone down gets back up, and the host tells the rest
function netCleared() { if (!netLink()) return; if (NET.host) netSend('clear', {}); if (P.dead) netRevive(); }
// a joiner's wave display, from the host's word for it
function clientWaves(dt) {
  if (phase === 'break') {
    const w = netWaiting();
    setH('wSub', w || `Next wave in ${Math.ceil(Math.max(0, breakT))}s · <kbd>T</kbd> to start now`);
    waveBar(breakT / breakMax, 'break');
  } else if (phase === 'wave') {
    const left = spawnQ.length + zombies.length;
    setH('wSub', `<b>${left}</b>` + (left === 1 ? ' zombie left' : ' zombies left'));
    waveBar(left / Math.max(1, run.waveTotal || left), 'wave');
  } else if (phase === 'cleared') {
    setH('wSub', 'Wave cleared'); waveBar(1, 'clear');
    clearT -= dt / Math.max(timeScale, 0.3);
    if (clearT <= 0) { openUpgrade(); return true; }
  }
  return false;
}
// who's still choosing their find after a wave ('' if nobody): the next wave waits for them
function netWaiting() {
  if (!netLink()) return '';
  const names = [...NET.peers.values()].filter(p => p.picking).map(p => p.name);
  return names.length ? 'Waiting for ' + names.join(', ') + ' to choose' : '';
}

// ---- going down in co-op: the farm goes on without you; you watch a teammate till the wave's cleared and you're back
function netDown() {
  timeScale = 1;
  if (!downTold) { downTold = true; setTimeout(() => { if (P.dead && netLink()) announce('You’re down', 'Back on your feet when the wave is cleared', { eye: 'Co-op', kind: 'red' }); }, 1600); }
}
function netRevive() {
  P.dead = false; P.deathT = 0; P.hp = Math.max(1, Math.round(S.maxHp * 0.5)); P.bleed = 0; P.slow = P.stun = 0; P.vx = P.vz = 0; P.kbx = P.kbz = 0; P.conc = 0;
  downTold = false;
  document.body.classList.remove('dying'); cv.style.filter = ''; cache.grey = null;
  if (ANIM.dropped) { scene.remove(ANIM.dropped.g); ANIM.dropped = null; }
  feed('med', P.hp, 'back on your feet'); SFX.upgrade();
}
// who the camera's on: you, or once you're down, the first teammate still standing
function camFocus() {
  if (!netLink() || !P.dead || P.deathT < 1.4) return P;
  for (const p of NET.peers.values()) if (!p.dead && p.x !== undefined) return p;
  return P;
}
// everyone down: the run's over for all of you (the host calls it)
NET_ON.over = () => { if (state === 'play' || state === 'paused') die(); };

// ---- every frame, playing or not
function netTick(rdt) {
  netBeat(rdt);
  if (!NET.on) return;
  if (NET.inGame && state !== 'title') {
    poseOut(rdt);
    if (NET.host) {
      snapOut(rdt);
      if ((state === 'play' || state === 'paused') && netAllDown()) { overT += rdt; if (overT > 3) { overT = 0; netSend('over', {}); die(); } } else overT = 0;
    }
  }
  updateAvatars(rdt);
  renderTeam();
}
// a fresh co-op run: no zombies known, each survivor starting a step apart from the others
function netRunStart() {
  NZ.clear(); zSeq = 0; overT = 0; downTold = false;
  if (!netLink()) return;
  const off = [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9]][NET.idx] || [0, 0];
  P.x += off[0]; P.z += off[1];
  for (const p of NET.peers.values()) { p.dead = false; p.picking = false; if (p.av) p.av.cur = null; }
}
