// Blood that builds up on you and your weapons: not pieces stuck on, but a stain worked into every surface by a shader.
// Smooth 3D noise is read in the space of whatever the surface rides on (a body part, or the weapon itself), so the
// stain runs on unbroken across skin, cloth, gear, steel and wood, moves with it, and comes in with soft wet edges. As
// it builds up it spreads out from where blood lands first (on you: the front of the chest, the forearms and fists,
// the shins, then the face and sides, the back last; on a gun the muzzle end; on a melee weapon its head and edge).
// Fresh blood is bright and wet and darkens as it dries. Every surface gets its own copy of its material carrying the
// shader (the originals are shared with the rest of the farm), kept in step with the original's colour each frame.
//
// The blood comes and goes splash by splash: each one stays as it landed for BLOOD_HOLD seconds, then fades away over
// BLOOD_FADE (on the world clock, so it waits while the game's paused), the stain drawing back from its thin edges as
// it goes. A fight leaves you, your weapon and the dead soaked; a quiet spell sees it gone again.

const BLOOD_HOLD = 15, BLOOD_FADE = 1.5;
// a splash of blood (amt, 0..1 of soaked) on a list of them; what lands within half a second of the last counts as
// one splash with it, so a list holds no more than a couple of dozen
function splashOn(list, amt) { const l = list[list.length - 1]; if (l && l[1] < 0.5) l[0] += amt; else list.push([amt, 0]); }
// how bloody a list of splashes leaves something (0..1): each ages by dt, fades over its last BLOOD_FADE seconds and
// is dropped once it's gone
function splashLevel(list, dt) {
  const end = BLOOD_HOLD + BLOOD_FADE; let b = 0;
  for (let k = list.length - 1; k >= 0; k--) {
    const s = list[k]; s[1] += dt;
    if (s[1] >= end) list.splice(k, 1); else b += s[0] * Math.min(1, (end - s[1]) / BLOOD_FADE);
  }
  return Math.min(1, b);
}
const youSplash = [];   // the splashes on you; a new run starts clean (clearBodyBlood)
function addBlood(char, wId, wAmt) {
  splashOn(youSplash, char * 1.3);
  if (wId && wAmt) splashOn(W8.bloodW[wId] || (W8.bloodW[wId] = []), wAmt);   // W8 starts afresh each run
}
function clearBodyBlood() { youSplash.length = 0; P.blood = 0; }

const BLOOD_NOISE = `
vec3 bmod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 bmod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 bperm(vec4 x) { return bmod289(((x * 34.0) + 1.0) * x); }
// 3D simplex noise (Ashima Arts / Stefan Gustavson), -1..1
float bsnoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = bmod289(i);
  vec4 p = bperm(bperm(bperm(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw); vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = inversesqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3))); p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0); m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;
// how soon each spot gets blood (higher = sooner), from its position in its frame. uMode 0 is you (uZone: 0 the chest
// and the upper body, 1 / 2 the arms, 3 / 4 the legs, 5 the head), 1 a gun (muzzle along +z), 2 a melee weapon (head up
// along +y, edge toward +z); uLo / uHi are a weapon's extent in its frame
const STAIN_FRAG = `
  {
    vec3 bp = vBloodP; float pri;
    if (uMode < 0.5) {
      if (uZone < 0.5) pri = 0.3 + 0.42 * smoothstep(-0.05, 0.16, bp.z) - 0.18 * smoothstep(0.05, 0.3, bp.y) * step(0.0, bp.z) - 0.22 * smoothstep(-0.02, -0.25, bp.z);
      else if (uZone < 2.5) pri = 0.22 + 0.48 * smoothstep(0.12, 0.5, bp.z) + 0.08 * step(0.0, bp.y);
      else if (uZone < 4.5) pri = 0.12 + 0.3 * smoothstep(-0.06, 0.1, bp.z) + 0.24 * smoothstep(-0.12, -0.5, bp.y);
      else pri = 0.04 + 0.3 * smoothstep(0.0, 0.15, bp.z) - 0.1 * smoothstep(0.05, 0.16, bp.y);
    } else {
      vec3 tn = clamp((bp - uLo) / max(uHi - uLo, vec3(0.001)), 0.0, 1.0);
      if (uMode < 1.5) pri = 0.1 + 0.62 * smoothstep(0.3, 1.0, tn.z) + 0.06 * step(0.5, tn.y);
      else pri = 0.06 + 0.58 * smoothstep(0.42, 1.0, tn.y) + 0.2 * smoothstep(0.35, 1.0, tn.z);
    }
    vec3 q = bp * uFreq + uSeed + vec3(uZone * 13.7, uZone * 5.3, uZone * 9.1);
    float n = 0.5 + 0.5 * (bsnoise(q) * 0.62 + bsnoise(q * 2.3 + 4.1) * 0.28 + bsnoise(q * 5.7 + 9.7) * 0.1);
    float v = n * 0.7 + pri * 0.45 + bsnoise(bp * uFreq * 4.1 + uSeed) * 0.035;
    float th = 0.98 - uBlood * 0.48;   // a few spots at first; even soaked, the far side stays patchy
    float a = smoothstep(th, th + 0.05, v) * smoothstep(0.0, 0.04, uBlood);
    if (a > 0.001) {
      float core = smoothstep(th + 0.03, th + 0.16, v);   // thicker, darker where it's pooled
      vec3 fresh = mix(vec3(0.45, 0.05, 0.035), vec3(0.3, 0.025, 0.02), core);
      vec3 dried = mix(vec3(0.24, 0.05, 0.035), vec3(0.15, 0.03, 0.022), core);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(dried, fresh, uFresh), a * mix(0.72, 0.95, core));
    }
    // wounds (zombies only, zombies/wounds.js): each a point in its part's frame (uWound: xyz, radius) and which part
    // and what kind (uWoundK: zone + 10 x kind). A bullet hole is black in a dark ring; an exit wound blown open, pale
    // bone round a dark crater with pink inside; a stump's end raw, the bone in the middle. Blood runs down from each
    for (int i = 0; i < WOUND_N; i++) {
      if (i >= uWoundN) break;
      float wk = uWoundK[i]; if (abs(mod(wk, 10.0) - uZone) > 0.5) continue;
      vec4 w = uWound[i]; vec3 d3 = bp - w.xyz; float r = w.w, kind = floor(wk / 10.0 + 0.01), dl = length(d3);
      vec3 dr = vec3(d3.x, d3.y < 0.0 ? d3.y * 0.22 : d3.y * 1.6, d3.z); float dRun = length(dr);
      if (dl > r * 1.6 && dRun > r * 1.3) continue;
      float d = dl * (1.0 + 0.22 * bsnoise(bp * 70.0 + w.xyz * 9.0));
      float run = smoothstep(r * 1.3, r * 0.5, dRun * (1.0 + 0.3 * bsnoise(bp * 34.0 + w.xyz * 5.0)));
      vec3 c = mix(diffuseColor.rgb, vec3(0.3, 0.025, 0.02), max(run * 0.88, smoothstep(r * 1.35, r * 0.9, d)));
      if (kind > 1.5) {
        c = mix(c, vec3(0.52, 0.07, 0.055), smoothstep(r * 0.98, r * 0.78, d));
        c = mix(c, vec3(0.22, 0.02, 0.02), smoothstep(r * 0.62, r * 0.46, d) * 0.55);
        c = mix(c, vec3(0.86, 0.82, 0.72), smoothstep(r * 0.3, r * 0.22, dl));
      } else if (kind > 0.5) {
        c = mix(c, vec3(0.8, 0.74, 0.64), smoothstep(r * 0.98, r * 0.82, d));
        c = mix(c, vec3(0.5, 0.08, 0.07), smoothstep(r * 0.8, r * 0.68, d));
        c = mix(c, vec3(0.66, 0.32, 0.32), smoothstep(r * 0.64, r * 0.44, d) * (0.45 + 0.55 * smoothstep(-0.3, 0.5, bsnoise(bp * 90.0))));
        c = mix(c, vec3(0.05, 0.004, 0.004), smoothstep(r * 0.46, r * 0.22, d));
      } else {
        c = mix(c, vec3(0.17, 0.012, 0.01), smoothstep(r * 0.8, r * 0.55, d));
        c = mix(c, vec3(0.025, 0.0, 0.0), smoothstep(r * 0.48, r * 0.3, d));
      }
      diffuseColor.rgb = c;
    }
    // burnt (a zombie set on fire, zombies/ai.js): char creeps over the body in patches as it burns, a scorched brown
    // edge running ahead of it, until the whole thing is a blackened corpse. While it's still alight the burning edge
    // and the cracks in the char glow like embers
    if (uChar > 0.001) {
      vec3 cq = bp * 6.0 + uSeed * 0.7;
      float cn = 0.5 + 0.5 * (bsnoise(cq) * 0.6 + bsnoise(cq * 2.7 + 3.3) * 0.3 + bsnoise(cq * 7.1 + 1.1) * 0.1);
      float ct = 1.02 - uChar * 1.2;
      float burnt = smoothstep(ct, ct + 0.1, cn), scorch = smoothstep(ct - 0.2, ct, cn) * (1.0 - burnt);
      vec3 charC = mix(vec3(0.045, 0.036, 0.03), vec3(0.12, 0.085, 0.06), 0.5 + 0.5 * bsnoise(cq * 3.9 + 5.2));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.33, 0.2), scorch * 0.85);
      diffuseColor.rgb = mix(diffuseColor.rgb, charC, burnt);
      if (uEmber > 0.001) {
        float front = smoothstep(ct - 0.012, ct + 0.012, cn) * (1.0 - smoothstep(ct + 0.025, ct + 0.05, cn));
        float crack = smoothstep(0.74, 0.92, 0.5 + 0.5 * bsnoise(cq * 5.3 + 1.7)) * burnt;
        totalEmissiveRadiance += vec3(1.0, 0.32, 0.05) * uEmber * (front * 0.75 + crack * 0.4);
      }
    }
  }`;
// a copy of a surface's material that carries the stain: frame is what it rides on, su the stain's own uniforms
// (shared by everything on you, or by one weapon)
function stainMat(orig, mesh, frame, su, mode, zone) {
  const m = orig.clone(), baseC = orig.onBeforeCompile, baseKey = orig.customProgramCacheKey;
  const u = Object.assign({ uPart: { value: new THREE.Matrix4().copy(frame.matrixWorld).invert().multiply(mesh.matrixWorld) }, uZone: { value: zone || 0 }, uMode: { value: mode } }, su);
  m.userData.mobile = true; m.userData.bloodOf = orig;
  m.onBeforeCompile = function (sh, r) {
    if (baseC) baseC.call(m, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform mat4 uPart;\nvarying vec3 vBloodP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBloodP = (uPart * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = '#define WOUND_N ' + WOUND_N + '\nuniform vec4 uWound[WOUND_N];\nuniform float uWoundK[WOUND_N];\nuniform int uWoundN;\nuniform float uChar;\nuniform float uEmber;\nuniform float uBlood;\nuniform float uFresh;\nuniform vec3 uSeed;\nuniform float uZone;\nuniform float uMode;\nuniform float uFreq;\nuniform vec3 uLo;\nuniform vec3 uHi;\nvarying vec3 vBloodP;\n' + BLOOD_NOISE + '\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + STAIN_FRAG);
  };
  m.customProgramCacheKey = () => (baseKey ? baseKey.call(orig) : '') + '-stain';
  return m;
}
const stainable = o => o.isMesh && !Array.isArray(o.material) && o.material.isMeshLambertMaterial && !o.material.transparent && !o.userData.isOutline && !o.userData.isFlash;
const WOUND_N = 8;   // wounds a zombie can show at once (zombies/wounds.js)
const stainU = freq => ({ uWound: { value: Array.from({ length: WOUND_N }, () => new THREE.Vector4()) }, uWoundK: { value: new Array(WOUND_N).fill(-1) }, uWoundN: { value: 0 }, uChar: { value: 0 }, uEmber: { value: 0 }, uBlood: { value: 0 }, uFresh: { value: 0 }, uSeed: { value: new V3(rr(0, 40), rr(0, 40), rr(0, 40)) }, uFreq: { value: freq }, uLo: { value: new V3() }, uHi: { value: new V3(1, 1, 1) } });

// stained copies swapped out for new ones (your gear re-laid, a weapon rebuilt) are let go a few frames later, once the
// new ones have been drawn. Freed at once, every copy using a stain shader could be gone before the next frame, and
// WebGL would throw that program away and compile it again: a hitch every time an attachment was bought or swapped
const stainBin = []; let stainBinT = 0;
function binStains(list) { list.forEach(([, m]) => stainBin.push(m)); stainBinT = 3; }
// ---- on you ----
const BLOOD_U = stainU(7.5);
const charBlood = [];   // [original material, the copy on you]
let charBloodDirty = true, bloodShown = 0, bloodWas = 0, charBloodN = 0, charBloodChk = 0;
function buildCharBlood() {
  charBloodDirty = false;
  binStains(charBlood); charBlood.length = 0;   // (let go once the new ones are drawn: binStains, below)
  PM.g.updateMatrixWorld(true);
  BLOOD_U.uSeed.value.set(rr(0, 40), rr(0, 40), rr(0, 40));
  const held = new Set(Object.values(gunMeshes)), zones = new Map([[PM.torso, 0], [PM.armL, 1], [PM.armR, 2], [PM.legL, 3], [PM.legR, 4], [PM.shinL, 3], [PM.shinR, 4], [PM.head, 5]]);
  const walk = (o, part, zone) => {
    if (held.has(o) || o.userData.slot !== undefined || o.userData.isOutline) return;
    if (zones.has(o)) { part = o; zone = zones.get(o); }
    if (stainable(o)) { const orig = o.material.userData.bloodOf || o.material, m = stainMat(orig, o, part, BLOOD_U, 0, zone); o.material = m; charBlood.push([orig, m]); }
    o.children.forEach(c => walk(c, part, zone));
  };
  // the upper body's own pieces (vest, pack, pouches) stain in the chest's frame, the hips' in the left leg's
  PM.upper.children.forEach(c => walk(c, PM.torso, 0)); PM.lower.children.forEach(c => walk(c, PM.legL, 3));
  charBloodN = 0; PM.g.traverse(o => { if (o.isMesh) charBloodN++; });
}
// each frame: the stain eases out to how bloody you are (so a hit spreads it rather than popping it on) and draws
// back as old splashes fade, fresh blood brightens it, and the copies keep the colour their originals have now (your
// shirt, skin and pack are re-dyed each run). Anything put on you since (another plank on the pack) is picked up
// within half a second.
function updateCharBlood(rdt, dt) {
  charBloodChk += rdt;
  if (charBloodChk > 0.5) { charBloodChk = 0; let n = 0; PM.g.traverse(o => { if (o.isMesh) n++; }); if (n !== charBloodN) charBloodDirty = true; }
  if (charBloodDirty) buildCharBlood();
  const b = P.blood = splashLevel(youSplash, dt);
  if (b > bloodWas + 0.001) BLOOD_U.uFresh.value = 1; else BLOOD_U.uFresh.value = Math.max(0, BLOOD_U.uFresh.value - rdt / 40);
  bloodWas = b;
  bloodShown += (b - bloodShown) * Math.min(1, rdt * (b > bloodShown ? 2.2 : BLOOD_BACK));
  BLOOD_U.uBlood.value = bloodShown;
  syncStains(charBlood);
}
const BLOOD_BACK = 6;   // how quickly a stain follows its blood fading (the fade itself is BLOOD_FADE)
function syncStains(list) { for (const [o, m] of list) { if (!m.color.equals(o.color)) m.color.copy(o.color); if (o.emissive && !m.emissive.equals(o.emissive)) m.emissive.copy(o.emissive); } }

// ---- on zombies: the same stain as yours, on each zombie's own copies of its materials. They come in with a little
// old blood on them already (b), which stays; every hit adds a splash over it, and so does being stood next to one
// that's hit or killed, and those fade like yours ----
function stainZombie(m) {
  const u = stainU(7.5), list = [], zones = new Map([[m.torso, 0], [m.armL, 1], [m.armR, 2], [m.legL, 3], [m.legR, 4], [m.head, 5]]);
  m.g.updateMatrixWorld(true);
  const walk = (o, part, zone) => {
    if (o.userData.isOutline) return;
    if (zones.has(o)) { part = o; zone = zones.get(o); }
    if (stainable(o)) { const orig = o.material, c = stainMat(orig, o, part, u, 0, zone); o.material = c; list.push([orig, c]); }
    o.children.forEach(c => walk(c, part, zone));
  };
  m.upper.children.forEach(c => walk(c, m.torso, 0)); m.lower.children.forEach(c => walk(c, m.legL, 3));
  return { u, list, b: rr(0.08, 0.32), sp: [], shown: 0, was: 0, char: 0, burn: 0, glow: 0 };
}
// more blood on a zombie (0..1)
function bloodZombie(z, amt) { if (z && z.stain) splashOn(z.stain.sp, amt); }
function updateZombieStain(st, rdt, dt) {
  if (!st) return;
  const b = Math.min(1, st.b + splashLevel(st.sp, dt));
  if (b > st.was + 0.001) st.u.uFresh.value = 1; else st.u.uFresh.value = Math.max(0, st.u.uFresh.value - rdt / 30);
  st.was = b; st.shown += (b - st.shown) * Math.min(1, rdt * (b > st.shown ? 3 : BLOOD_BACK)); st.u.uBlood.value = st.shown;
  // how burnt it is (st.char, grown while it burns: zombies/ai.js, zombies/deaths.js), and the embers while it's alight
  st.glow += ((st.burn > 0 ? 1 : 0) - st.glow) * Math.min(1, rdt * 2.5);
  st.u.uChar.value = st.char; st.u.uEmber.value = st.glow * (0.8 + 0.2 * Math.sin(worldT * 9.3) * Math.sin(worldT * 5.1 + 1));
  syncStains(st.list);
}

// ---- on your weapons: each weapon has its own stain, built with the model (weapons/build-weapons.js); the copies you
// carry on your body share it ----
const WSTAIN = {};   // weapon id -> { u, list, shown, was }
function stainWeapon(id, frames, melee) {
  const old = WSTAIN[id]; if (old) binStains(old.list);
  const S = WSTAIN[id] = { u: stainU(melee ? 15 : 17), list: [], shown: old ? old.shown : 0, was: old ? old.was : 0 };
  frames.forEach(f => {
    f.updateMatrixWorld(true);
    const inv = f.matrixWorld.clone().invert(), bb = new THREE.Box3(), tb = new THREE.Box3(), rel = new THREE.Matrix4();
    f.traverse(o => { if (!stainable(o)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.union(tb.copy(o.geometry.boundingBox).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld))); });
    if (bb.isEmpty()) return;
    S.u.uLo.value.copy(bb.min); S.u.uHi.value.copy(bb.max);
    f.traverse(o => { if (!stainable(o)) return; const orig = o.material.userData.bloodOf || o.material, m = stainMat(orig, o, f, S.u, melee ? 2 : 1); o.material = m; S.list.push([orig, m]); });
  });
}
function updateWeaponBlood(rdt, dt) {
  if (stainBin.length && --stainBinT <= 0) { stainBin.forEach(m => m.dispose()); stainBin.length = 0; }   // (binStains)
  for (const id in WSTAIN) {
    const S = WSTAIN[id], sp = W8.bloodW[id], b = sp ? splashLevel(sp, dt) : 0;
    if (b > S.was + 0.001) S.u.uFresh.value = 1; else S.u.uFresh.value = Math.max(0, S.u.uFresh.value - rdt / 30);
    S.was = b; S.shown += (b - S.shown) * Math.min(1, rdt * (b > S.shown ? 3 : BLOOD_BACK)); S.u.uBlood.value = S.shown;
    syncStains(S.list);
  }
}
