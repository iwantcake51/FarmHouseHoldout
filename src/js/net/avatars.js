// Co-op teammates on your screen: each one's survivor built from the same body as yours (PM_BASE, player/player.js)
// in their own look (player/look.js), posed every frame from the pose their game sends (twenty times a second, eased
// in between), with the weapon they're holding in their hands and their name over their head. Their shots are drawn
// and heard here too: the tracer, the flash and the bang, quieter the further off they are.

// the joints a pose carries, in order: where each is and how it's turned (and the arms how they're stretched)
const POSE_K = ['g', 'upper', 'lower', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'shinL', 'shinR'];
const POSE_N = POSE_K.length + 3;   // and the weapon: its holder, and the right and left hand's hold inside it
const r3 = v => Math.round(v * 1000) / 1000;

// ---- your pose, sent out
let poseT = 0;
function poseOut(rdt) {
  if (!netLink()) return;
  poseT -= rdt; if (poseT > 0) return; poseT = 0.05;
  const s = W8.cur, gg = gunMeshes[s], hs = HOLDS[s] || {}, j = [];
  const put = o => { if (!o) { j.push(0, 0, 0, 0, 0, 0); return; } j.push(r3(o.position.x), r3(o.position.y), r3(o.position.z), r3(o.rotation.x), r3(o.rotation.y), r3(o.rotation.z)); };
  POSE_K.forEach(k => put(PM[k])); put(gg); put(hs.R); put(hs.L);
  j.push(r3(PM.armL.scale.x), r3(PM.armL.scale.z), r3(PM.armR.scale.x), r3(PM.armR.scale.z));
  const id = curId(), D = W(id) || {};
  netSend('p', { x: r3(P.x), z: r3(P.z), a: r3(P.aim), hp: Math.round(Math.max(0, P.hp)), mh: S.maxHp, dead: P.dead ? 1 : 0, v: P.vault ? 1 : 0, w: id, ak: D.akimbo ? 1 : 0, gv: gg && gg.visible ? 1 : 0, pk: state === 'upgrade' || state === 'leaving' ? 1 : 0, j });
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
  const live = { live: new Set(Object.values(mats)) };
  Object.values(groups).forEach(q => { q.traverse(o => { if (o.isMesh) o.castShadow = true; }); mergeInto(q, finePieces(q), live); });
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
    h.traverse(o => { if (o.isMesh) o.castShadow = true; });
  };
  if (D.melee) build(a.gunM);
  else { build(a.holdR); if (ak) build(a.holdL); }
}
// a pose in: kept as where they're headed; their survivor eases there over the next frames
NET_ON.p = m => {
  const p = NET.peers.get(m.f); if (!p) return;
  Object.assign(p, { x: m.x, z: m.z, aim: m.a, hp: m.hp, maxHp: m.mh, dead: !!m.dead, vault: !!m.v, picking: !!m.pk, w: m.w, ak: !!m.ak, gv: !!m.gv });
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
    for (let i = 0; i < t.length; i++) {
      const rot = i < POSE_N * 6 && i % 6 >= 3;
      c[i] = first ? t[i] : rot ? c[i] + angDiff(t[i], c[i]) * k : c[i] + (t[i] - c[i]) * (Math.abs(t[i] - c[i]) > 3 ? 1 : k);
    }
    const set = (o, n) => { const b = n * 6; o.position.set(c[b], c[b + 1], c[b + 2]); o.rotation.set(c[b + 3], c[b + 4], c[b + 5]); };
    POSE_K.forEach((key, n) => set(a[key], n));
    const melee = WEAP[p.w] && WEAP[p.w].melee, holder = melee ? a.gunM : a.gunU;
    set(holder, POSE_K.length); (melee ? a.gunU : a.gunM).visible = false; holder.visible = p.gv && !p.dead;
    if (!melee) { set(a.holdR, POSE_K.length + 1); set(a.holdL, POSE_K.length + 2); a.holdL.visible = p.ak; }
    const sb = POSE_N * 6; a.armL.scale.set(c[sb], c[sb], c[sb + 1]); a.armR.scale.set(c[sb + 2], c[sb + 2], c[sb + 3]);
    if (a.blob) { a.blob.position.set(a.g.position.x, 0.02, a.g.position.z); }
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
function heardFrom(name, x, z, vol) {
  const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
  const pan = clamp((dx * RIGHT.x + dz * RIGHT.z) / 14, -0.6, 0.6), v = (vol ?? 1) * clamp(1.1 - d / 34, 0.18, 1);
  playS(name, { vol: v, pan, jit: 0.06, tone: 3, lp: d > 10 ? clamp(16000 - d * 450, 2500, 16000) : 20000, verb: indoors() ? 0.4 : 0 });
}
