// Co-op teammates on your screen: each one's survivor built from the same body as yours (PM_BASE, player/player.js)
// in their own look (player/look.js), posed every frame from the pose their game sends (twenty times a second, eased
// in between), with the weapon they're holding in their hands and their name over their head. Their shots are drawn
// and heard here too: the tracer, the flash and the bang, quieter the further off they are.

// the joints a pose carries, in order: where each is and how it's turned (and the arms how they're stretched)
const POSE_K = ['g', 'upper', 'lower', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'shinL', 'shinR'];
const POSE_N = POSE_K.length + 3;   // and the weapon: its holder, and the right and left hand's hold inside it
const r3 = v => Math.round(v * 1000) / 1000, r2 = v => Math.round(v * 100) / 100;

// ---- your pose, sent out POSE_HZ times a second: the joints to the centimetre and the hundredth of a radian (eased on
// their side, that's finer than shows), where you are to the millimetre and how fast you're going, so your survivor can
// be drawn a moment ahead on their screens instead of a moment behind
const POSE_HZ = 15;
let poseT = 0, poseX = 0, poseZ = 0, poseAt = 0;
function poseOut(rdt) {
  if (!netLink()) return;
  poseT -= rdt; if (poseT > 0) return; poseT = 1 / POSE_HZ;
  const s = W8.cur, gg = gunMeshes[s], hs = HOLDS[s] || {}, j = [];
  const put = (o, fine) => { if (!o) { j.push(0, 0, 0, 0, 0, 0); return; } const r = fine ? r3 : r2; j.push(r(o.position.x), r2(o.position.y), r(o.position.z), r2(o.rotation.x), r2(o.rotation.y), r2(o.rotation.z)); };
  POSE_K.forEach((k, n) => put(PM[k], n === 0)); put(gg); put(hs.R); put(hs.L);
  j.push(r2(PM.armL.scale.x), r2(PM.armL.scale.z), r2(PM.armR.scale.x), r2(PM.armR.scale.z));
  const id = curId(), D = W(id) || {}, now = performance.now(), dt = Math.max(0.03, (now - poseAt) / 1000);
  const vx = clamp((P.x - poseX) / dt, -12, 12), vz = clamp((P.z - poseZ) / dt, -12, 12); poseX = P.x; poseZ = P.z; poseAt = now;
  netSend('p', { x: r3(P.x), z: r3(P.z), vx: r2(vx), vz: r2(vz), hp: Math.round(Math.max(0, P.hp)), mh: S.maxHp, dead: P.dead ? 1 : 0, v: P.vault ? 1 : 0, w: id, ak: D.akimbo ? 1 : 0, gv: gg && gg.visible ? 1 : 0, pk: state === 'upgrade' || state === 'leaving' ? 1 : 0, j });
}

// ---- their survivors
const AV_SWAP = ['skin', 'shirt', 'pants', 'shirtDk', 'skinDk'];
function buildAvatar(p) {
  const L = p.look || dealLook();
  const g = PM_BASE.clone(true);
  // their own materials for everything coloured by the look; the rest (the belt, the buckles, the webbing) is shared
  const mats = { skin: lam(L.skin), shirt: lam(L.topCol), pants: lam(L.pants), shirtDk: lam(shade(L.topCol, 0.76)), skinDk: lam(shade(L.skin, 0.86)) };
  const pack = { canvas: lam(L.pack), canvasDk: lam(shade(L.pack, 0.78)), canvasLt: lam(shade(L.pack, 1.22)), roll: lam(L.roll) };
  const swap = new Map(); AV_SWAP.forEach(k => swap.set(PM.mats[k], mats[k])); Object.keys(PACK).forEach(k => swap.set(PACK[k], pack[k]));
  g.traverse(o => { if (o.isMesh && swap.has(o.material)) o.material = swap.get(o.material); if (o.isMesh) o.castShadow = true; });
  const rig = { g, mats };
  POSE_K.forEach(k => { rig[k] = g.getObjectByName('pm.' + k); });
  // the look, built onto their rig: buildLook works on whatever LOOK.g and PM.mats hold, so for a moment they hold theirs
  const groups = {}, on = { head: rig.head, hat: rig.head, torso: rig.torso, armL: rig.armL, armR: rig.armR, legL: rig.legL, legR: rig.legR, shinL: rig.shinL, shinR: rig.shinR, shoeL: rig.shinL, shoeR: rig.shinR };
  for (const k in on) { const q = new THREE.Group(); on[k].add(q); groups[k] = q; if (k.startsWith('shin') || k.startsWith('shoe')) q.position.y = -KNEE_Y; }
  const keepG = LOOK.g, keepM = PM.mats, keepY = LOOK.mirrorY;
  try { LOOK.g = groups; PM.mats = Object.assign({}, keepM, mats); buildLook(L); } catch (e) { console.warn('avatar look', e); }
  finally { LOOK.g = keepG; PM.mats = keepM; LOOK.mirrorY = keepY; }
  // then everything that rides on each joint (the look, the pack, the belt, the pouches) folded into a mesh or two:
  // their colours never change, so it all bakes into one vertex-coloured material per joint (mergeInto,
  // core/geometry.js) and a teammate costs a few dozen draws, not a couple of hundred
  const joints = new Set(POSE_K.map(k => rig[k]));
  for (const J of joints) {
    const parts = []; (function walk(o) { o.children.forEach(c => { if (joints.has(c)) return; if (c.isMesh && c.visible) parts.push(c); else if (!c.isMesh && !c.visible) return; walk(c); }); })(J);
    parts.forEach(o => { o.castShadow = true; });
    if (parts.length > 1) mergeInto(J, parts);
  }
  // the weapon in their hands: a holder on the upper body for guns (with a hold for each hand), on the right arm for melee
  rig.gunU = new THREE.Group(); rig.upper.add(rig.gunU);
  rig.gunM = new THREE.Group(); rig.armR.add(rig.gunM);
  rig.holdR = new THREE.Group(); rig.holdL = new THREE.Group(); rig.gunU.add(rig.holdR, rig.holdL);
  rig.w = null;
  rig.blob = blobShadow(1.15, 0.38);
  // a faint rim in their colour, so you can pick them out in the dark and in a crowd
  rig.ol = outline(g, new THREE.Color(NET_COL[p.idx] || '#888').getHex(), 0, 0.012, null, o => !o.userData.fine); rig.ol.opacity = 0.35; rig.ol.depthWrite = false;
  scene.add(g);
  g.position.set(P.x, 0, P.z);
  // their name over their head
  const tag = document.createElement('div'); tag.className = 'tag'; tag.style.setProperty('--pc', NET_COL[p.idx] || '#888');
  tag.textContent = p.name; const bar = document.createElement('s'); bar.innerHTML = '<u></u>'; tag.appendChild(bar); $('tags').appendChild(tag);
  rig.tag = tag; rig.tagBar = bar.firstChild;
  rig.cur = null; rig.tgt = null;
  p.av = rig;
  return rig;
}
function netDropAvatar(p) {
  const a = p.av; if (!a) return;
  scene.remove(a.g); if (a.blob) scene.remove(a.blob); if (a.tag) a.tag.remove();
  p.av = null;
}
// their weapon changed: build the new one's model (as it comes, without their mods) into the hands
function avatarWeapon(a, id, ak) {
  if (a.w === id && a.ak === ak) return;
  a.w = id; a.ak = ak;
  [a.gunM, a.holdR, a.holdL].forEach(h => { while (h.children.length) h.remove(h.children[0]); });
  const D = WEAP[id]; if (!D || !GUNS[id]) return;
  const build = h => {
    const mg = new THREE.Group(); h.add(mg); h.userData.magG = mg;
    tierCtx = null;
    let info = null;
    try { info = GUNS[id](h, {}); } catch (e) { console.warn('avatar weapon', id, e); }
    if (info && info.baseMag && !info.ownMags) magBox(mg, 0.056, info.baseMag, 0.08, X, info.magY - info.baseMag / 2, info.magZ);
    // nothing on it moves in their hands here, so the whole weapon folds into a mesh or two
    const parts = []; h.traverse(o => { if (o.isMesh && o.visible && !o.userData.isFlash) { o.castShadow = true; parts.push(o); } });
    if (parts.length > 1) mergeInto(h, parts);
  };
  if (D.melee) build(a.gunM);
  else { build(a.holdR); if (ak) build(a.holdL); }
}
// a pose in: kept as where they're headed; their survivor eases there over the next frames
NET_ON.p = m => {
  const p = NET.peers.get(m.f); if (!p) return;
  Object.assign(p, { x: m.x, z: m.z, vx: m.vx || 0, vz: m.vz || 0, hp: m.hp, maxHp: m.mh, dead: !!m.dead, vault: !!m.v, picking: !!m.pk, w: m.w, ak: !!m.ak, gv: !!m.gv });
  p.tgt = m.j; p.poseAt = performance.now();
};
// every frame: each teammate's survivor eased toward their last pose, their name over them
const _tagV = new V3();
function updateAvatars(rdt) {
  const show = netLink() && (state === 'play' || state === 'paused' || state === 'upgrade' || state === 'leaving' || state === 'dead');
  for (const p of NET.peers.values()) {
    if (!show || !p.tgt) { if (p.av) { p.av.g.visible = false; p.av.tag.style.opacity = 0; if (p.av.blob) p.av.blob.visible = false; } continue; }
    const a = p.av || buildAvatar(p), t = p.tgt;
    a.g.visible = true; if (a.blob) a.blob.visible = !p.dead;
    avatarWeapon(a, p.w, p.ak);
    const k = 1 - Math.exp(-rdt * 16), first = !a.cur;
    if (first) a.cur = t.slice();
    const c = a.cur;
    // where they are now, not where they were: their last position carried on along how fast they were going, for as
    // long as the pose has been on its way (a fifth of a second at most, and not while they're climbing or down)
    const ahead = p.vault || p.dead ? 0 : Math.min(0.2, (performance.now() - p.poseAt) / 1000 + 0.05);
    for (let i = 0; i < t.length; i++) {
      const rot = i < POSE_N * 6 && i % 6 >= 3, want = i === 0 ? t[0] + (p.vx || 0) * ahead : i === 2 ? t[2] + (p.vz || 0) * ahead : t[i];
      c[i] = first ? want : rot ? c[i] + angDiff(want, c[i]) * k : c[i] + (want - c[i]) * (Math.abs(want - c[i]) > 3 ? 1 : k);
    }
    const set = (o, n) => { const b = n * 6; o.position.set(c[b], c[b + 1], c[b + 2]); o.rotation.set(c[b + 3], c[b + 4], c[b + 5]); };
    POSE_K.forEach((key, n) => set(a[key], n));
    const melee = WEAP[p.w] && WEAP[p.w].melee, holder = melee ? a.gunM : a.gunU;
    set(holder, POSE_K.length); (melee ? a.gunU : a.gunM).visible = false; holder.visible = p.gv && !p.dead;
    if (!melee) { set(a.holdR, POSE_K.length + 1); set(a.holdL, POSE_K.length + 2); a.holdL.visible = p.ak; }
    const sb = POSE_N * 6; a.armL.scale.set(c[sb], c[sb], c[sb + 1]); a.armR.scale.set(c[sb + 2], c[sb + 2], c[sb + 3]);
    if (a.blob) { a.blob.position.set(a.g.position.x, 0.02, a.g.position.z); }
    // their footsteps, from their feet: a step every stride's length they cover, a run's when they're moving fast
    { const gx = a.g.position.x, gz = a.g.position.z, d = a.lx === undefined ? 0 : Math.hypot(gx - a.lx, gz - a.lz); a.lx = gx; a.lz = gz;
      if (d < 1 && !p.dead && !p.vault) { const sp = Math.hypot(p.vx || 0, p.vz || 0), run = sp > 4.2; a.walked = (a.walked || 0) + d; if (a.walked > (run ? 1.05 : 0.72)) { a.walked = 0; footstep(run ? 'run' : 'walk', 0.85, gx, gz); } } }
    // the name: over the head, gone while they're out of sight or past the edge of the screen
    a.head.getWorldPosition(_tagV); _tagV.y += 0.42; _tagV.project(cam);
    const sx = (_tagV.x * 0.5 + 0.5) * innerWidth, sy = (-_tagV.y * 0.5 + 0.5) * innerHeight, inView = _tagV.z < 1 && sx > -40 && sx < innerWidth + 40 && sy > -20 && sy < innerHeight + 20;
    a.tag.style.opacity = inView ? (p.dead ? 0.5 : 1) : 0;
    if (inView) a.tag.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
    const hk = clamp((p.hp ?? 100) / (p.maxHp || 100), 0, 1); if (a.hk !== hk) { a.hk = hk; a.tagBar.style.transform = `scaleX(${hk.toFixed(3)})`; }
  }
}
// you and a teammate don't stand inside each other: you're eased apart (they do the same on their side)
function avatarPush() {
  if (!netLink() || P.vault || P.dead) return;
  for (const p of NET.peers.values()) {
    if (p.dead || p.vault || p.x === undefined) continue;
    const dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.55 && d > 0.001) moveCircle(P, dx / d * (0.55 - d) * 0.5, dz / d * (0.55 - d) * 0.5, 0.3, true);
  }
}

// ---- their shots: what your own would show, from where they stand
function shotOut(id, D, mw, ends, trSt, trPw, quiet) {
  if (!netLink()) return;
  netSend('shot', { w: id, q: quiet ? 1 : 0, x: r3(mw.x), y: r3(mw.y), z: r3(mw.z), e: ends.map(e => [r3(e[0]), r3(e[1]), r3(e[2])]), st: trSt, pw: r3(trPw), sh: D.ammo === 'shells' ? 1 : 0, dr: D.dragon ? 1 : 0 });
}
NET_ON.shot = m => {
  if (state === 'title') return;
  for (const e of m.e) tracer(m.x, m.y, m.z, e[0], e[1], e[2], m.pw, m.st);
  if (!m.q) { flashes.push({ x: m.x, z: m.z, r: m.sh ? 7 : 5.5, int: 1.5, col: [1, 0.78, 0.45], t: 0.07, max: 0.07 }); lmT = 0; fx('flash', m.x, m.y, m.z, 0, 0, 0, 0.35, m.sh ? 0.9 : 0.6, 0.06, 1); }
  if (m.e.length) { const e = m.e[0], L = Math.hypot(e[0] - m.x, e[2] - m.z) || 1; smoke(m.x, m.y, m.z, (e[0] - m.x) / L * 0.8, 0.2, (e[2] - m.z) / L * 0.8, 0.08, m.q ? 0.35 : 0.7, 1.1, m.q ? 0.22 : 0.38); }
  heardFrom(m.q ? SUPP_SFX[m.w] : 'shot_' + m.w, m.x, m.z, m.q ? 0.55 : 1);
};
// a recorded sound from somewhere on the farm: quieter and duller the further it is from you, and off to its side
// (earFrom, audio/spatial.js: the further, the quieter and duller; through the house's walls, muffled)
function heardFrom(name, x, z, vol) { playS(name, { at: [x, z], vol: vol ?? 1, jit: 0.06, tone: 3, verb: indoors() ? 0.4 : 0 }); }
