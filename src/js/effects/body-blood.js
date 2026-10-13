// Blood that builds up on you and your weapons.

const BLOOD_M = [lam(0x6e1510), lam(0x4e0e0b), lam(0x5c120e)];
// spatter a built weapon: melee weapons get it on the head of the weapon, guns towards the muzzle. Either way the splats
// are found by casting rays at the weapon's real surface, so they sit on the steel and the wood, never out in the air
// round its bounding box.
function bloodWeapon(g, melee) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), bb = new THREE.Box3(), tb = new THREE.Box3(), rel = new THREE.Matrix4();
  g.traverse(o => { if (!bloodable(o)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); rel.multiplyMatrices(inv, o.matrixWorld); bb.union(tb.copy(o.geometry.boundingBox).applyMatrix4(rel)); });
  if (bb.isEmpty()) return [];
  return melee ? bloodMelee(g, bb, inv) : bloodGun(g, bb, inv);
}
// the solid parts blood can land on (not outlines, the muzzle flash or see-through glass and beams)
const bloodable = o => o.isMesh && !o.userData.isOutline && !o.userData.isFlash && !(o.material && o.material.transparent);
const BLOOD_FRESH = lam(0x8a1a12), DISC = new THREE.CylinderGeometry(1, 1, 1, 12), _bY = new V3(0, 1, 0);
// rays at a weapon's surface and flat blood discs laid on it, in the weapon's own frame (local); list, when given, is
// the surfaces to use instead of everything under g
function bloodKit(g, inv, list) {
  const meshes = list || [], rc = new THREE.Raycaster(), t = new V3(), x = new V3(), mx = new THREE.Matrix4(), nInv = new THREE.Matrix3().getNormalMatrix(inv), wo = new V3(), wd = new V3();
  if (!list) g.traverse(m => { if (bloodable(m)) meshes.push(m); });
  // one flat disc lying on the surface at p, facing nn; stretched along the surface's downhill line for a drip, or
  // along tan when it's given
  const disc = (list, p, nn, w, len, lift, mat, slide, tan) => {
    if (tan) t.copy(tan).addScaledVector(nn, -nn.dot(tan)); else t.copy(_bY).negate().addScaledVector(nn, nn.y);
    if (t.lengthSq() < 0.02) t.set(0, 0, 1).addScaledVector(nn, -nn.z); t.normalize();
    x.crossVectors(nn, t); mx.makeBasis(x, nn, t);
    const m = new THREE.Mesh(DISC, mat); m.quaternion.setFromRotationMatrix(mx); m.scale.set(w, 0.0016, len);
    m.position.copy(p).addScaledVector(nn, 0.0012 + lift).addScaledVector(t, slide || 0); m.visible = false; g.add(m); list.push(m); return m;
  };
  // is the weapon's surface really there at p, facing nn? Droplets and drips that would hang off an edge are dropped
  const _a = new V3(), _b = new V3(), onSurf = (p, nn) => {
    _a.copy(p).addScaledVector(nn, 0.03).applyMatrix4(g.matrixWorld); _b.copy(p).applyMatrix4(g.matrixWorld);
    const dist = _a.distanceTo(_b); rc.set(_a, _b.sub(_a).normalize()); rc.far = dist * 1.6;
    const h = rc.intersectObjects(meshes, false)[0]; rc.far = Infinity; return !!h && Math.abs(h.distance - dist) < dist * 0.25;
  };
  // the first surface a ray from o along d meets: where, and which way it faces
  const cast = (o, d) => {
    rc.set(wo.copy(o).applyMatrix4(g.matrixWorld), wd.copy(d).transformDirection(g.matrixWorld));
    const h = rc.intersectObjects(meshes, false)[0]; if (!h || !h.face) return null;
    return { p: h.point.clone().applyMatrix4(inv), n: h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).applyMatrix3(nInv).normalize() };
  };
  // a splat at p: a round blob, a wetter centre, a few droplets thrown off round it and sometimes a drip running down
  const splat = (p, nn, r, drip) => {
    const list = [];
    disc(list, p, nn, r * rr(0.8, 1.2), r * rr(0.8, 1.3), 0, pick(BLOOD_M));
    disc(list, p, nn, r * 0.55, r * 0.5, 0.0004, BLOOD_FRESH, -r * 0.15);
    for (let s = 0, ns = 1 + (rand() * 3 | 0); s < ns; s++) {
      const a = rand() * 6.28, dd = r * rr(1.3, 2.2), side = new V3().crossVectors(nn, _bY); if (side.lengthSq() < 0.01) side.set(1, 0, 0); side.normalize();
      const up = new V3().crossVectors(side, nn).normalize(), q = p.clone().addScaledVector(side, Math.cos(a) * dd).addScaledVector(up, Math.sin(a) * dd);
      const rs = r * rr(0.18, 0.35); if (onSurf(q, nn)) disc(list, q, nn, rs, rs, 0.0002 * s, pick(BLOOD_M));
    }
    if (drip && rand() < 0.5 && Math.abs(nn.y) < 0.35) {   // a drip, on faces steep enough to run, and only as far as the face goes
      const dl = r * rr(1.6, 3.4), m = disc(list, p, nn, r * rr(0.22, 0.32), dl, 0.0006, pick(BLOOD_M), dl * 0.75);
      const run = m.position.clone().sub(p); run.addScaledVector(nn, -nn.dot(run)).normalize();   // downhill along the face
      if (!onSurf(p.clone().addScaledVector(run, dl * 1.7), nn)) { g.remove(m); list.pop(); }
    }
    return list;
  };
  // a spray: an elongated blob thrown along ang (an angle on the surface), with droplets flung on past it that get
  // smaller the further they go, and sometimes a run down the face. It reads as splashed on rather than painted round.
  const _sd = new V3(), _su = new V3(), _sv = new V3();
  const spray = (p, nn, r, ang, drip) => {
    const list = [];
    _sd.crossVectors(nn, _bY); if (_sd.lengthSq() < 0.01) _sd.set(1, 0, 0); _sd.normalize(); _su.crossVectors(_sd, nn).normalize();
    const dir = new V3().copy(_sd).multiplyScalar(Math.cos(ang)).addScaledVector(_su, Math.sin(ang)), perp = new V3().crossVectors(nn, dir).normalize();
    disc(list, p, nn, r * rr(0.55, 0.85), r * rr(1.3, 2.1), 0, pick(BLOOD_M), 0, dir);
    disc(list, p, nn, r * 0.38, r * 0.7, 0.0004, BLOOD_FRESH, -r * 0.25, dir);
    for (let s = 0, ns = 3 + (rand() * 4 | 0); s < ns; s++) {
      const f = rr(1.2, 3.3), q = _sv.copy(p).addScaledVector(dir, r * f).addScaledVector(perp, r * rr(-0.5, 0.5) * f * 0.45).clone();
      const rs = r * rr(0.12, 0.3) * Math.max(0.35, 1.3 - f * 0.25);
      if (onSurf(q, nn)) disc(list, q, nn, rs, rs * rr(1, 1.9), 0.0002 * (s + 1), pick(BLOOD_M), 0, dir);
    }
    if (drip && rand() < 0.4 && Math.abs(nn.y) < 0.35) {
      const dl = r * rr(1.4, 3), m = disc(list, p, nn, r * rr(0.16, 0.24), dl, 0.0006, pick(BLOOD_M), dl * 0.75);
      const run = m.position.clone().sub(p); run.addScaledVector(nn, -nn.dot(run)).normalize();
      if (!onSurf(p.clone().addScaledVector(run, dl * 1.7), nn)) { m.parent.remove(m); list.pop(); }
    }
    return list;
  };
  return { cast, splat, spray };
}
// spots sorted into the order they show as the blood builds up (lowest threshold first)
function bloodOrder(clusters) {
  const spots = [];
  clusters.sort((a, b) => a.th - b.th).forEach((c, k) => c.list.forEach(m => { m.userData.th = (k + 0.5) / clusters.length; spots.push(m); }));
  return spots;
}
// guns (barrel along +z): splats on the front half, mostly on the sides and some on top; the ones nearest the muzzle
// show first, so the blood creeps back along the gun as it builds up
function bloodGun(g, bb, inv) {
  const { min, max } = bb, len = max.z - min.z, kit = bloodKit(g, inv), clusters = [], o = new V3(), d = new V3();
  for (let k = 0; k < 50 && clusters.length < 9; k++) {
    const fz = 1 - Math.pow(rand(), 1.6) * 0.6, z = min.z + len * fz, f = rand();
    if (f < 0.68) { const sd = rand() < 0.5 ? -1 : 1; o.set(sd > 0 ? max.x + 0.3 : min.x - 0.3, rr(min.y, max.y), z); d.set(-sd, 0, 0); }
    else { o.set(rr(min.x, max.x), max.y + 0.3, z); d.set(0, -1, 0); }
    const hit = kit.cast(o, d); if (!hit) continue;
    const muzzle = clamp((hit.p.z - min.z) / Math.max(0.01, len), 0, 1);
    clusters.push({ th: clamp(1 - muzzle + rr(-0.2, 0.2), 0.01, 0.99), list: kit.splat(hit.p, hit.n, rr(0.008, 0.017), true) });
  }
  return bloodOrder(clusters);
}
// melee weapons (handle down along +y, striking edge toward +z): splats over the striking end, mostly on the flat
// sides, some straight onto the edge and a few onto the top of the head. The ones nearest the edge and the tip show
// first, so the blood creeps down the weapon as it builds up.
function bloodMelee(g, bb, inv) {
  const { min, max } = bb, L = max.y - min.y, kit = bloodKit(g, inv), clusters = [], o = new V3(), d = new V3();
  for (let k = 0; k < 70 && clusters.length < 20; k++) {
    const fy = 1 - Math.pow(rand(), 2) * 0.48, y = min.y + L * fy, f = rand();
    if (f < 0.72) { const sd = rand() < 0.5 ? -1 : 1; o.set(sd > 0 ? max.x + 0.3 : min.x - 0.3, y, rr(min.z, max.z)); d.set(-sd, 0, 0); }
    else if (f < 0.92) { o.set(rr(min.x, max.x), y, max.z + 0.3); d.set(0, 0, -1); }
    else { o.set(rr(min.x, max.x) * 0.6, max.y + 0.3, rr(min.z, max.z) * 0.8); d.set(0, -1, 0); }
    const hit = kit.cast(o, d); if (!hit) continue;
    const edge = clamp((hit.p.z - min.z) / Math.max(0.01, max.z - min.z), 0, 1), tip = (fy - 0.52) / 0.48;
    clusters.push({ th: clamp(1 - (0.55 * tip + 0.45 * edge) + rr(-0.18, 0.18), 0.01, 0.99), list: kit.splat(hit.p, hit.n, rr(0.011, 0.026), true) });
  }
  return bloodOrder(clusters);
}
function addBlood(char, wId, wAmt) {
  P.blood = Math.min(1, (P.blood || 0) + char * 1.3);
  if (wId && wAmt) W8.bloodW[wId] = Math.min(1, (W8.bloodW[wId] || 0) + wAmt);
}

// ---- blood on you: not pieces stuck on, but a stain worked into every surface you have on (skin, shirt, jacket, vest
// or plate carrier, the pack, boots, hat) by a shader. Smooth 3D noise is read in the space of the body part each
// surface rides on, so the stain runs on unbroken across skin, cloth and gear, moves with the limbs, and comes in with
// soft wet edges. As you get bloodier the stain spreads out from where blood lands first (the front of the chest, the
// forearms and fists, the shins) to the face, the sides and last the back; fresh blood is bright and wet and darkens
// as it dries. Each run gets its own pattern.
//
// Every surface on you gets its own copy of its material carrying the shader (the originals are shared with the rest of
// the farm), kept in step with the original's colour each frame. They're made again whenever your gear or look changes.
const BLOOD_U = { uBlood: { value: 0 }, uFresh: { value: 0 }, uSeed: { value: new V3() } };
const charBlood = [];   // [original material, the copy on you]
let charBloodDirty = true, bloodShown = 0, bloodWas = 0;
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
// where on each part blood lands first (higher = sooner), from the position in that part's own frame:
// 0 chest and everything on the upper body, 1 / 2 the arms, 3 / 4 the legs, 5 the head
const BLOOD_FRAG = `
  {
    vec3 bp = vBloodP; float pri;
    if (uZone < 0.5) pri = 0.3 + 0.42 * smoothstep(-0.05, 0.16, bp.z) - 0.18 * smoothstep(0.05, 0.3, bp.y) * step(0.0, bp.z) - 0.22 * smoothstep(-0.02, -0.25, bp.z);
    else if (uZone < 2.5) pri = 0.22 + 0.48 * smoothstep(0.12, 0.5, bp.z) + 0.08 * step(0.0, bp.y);
    else if (uZone < 4.5) pri = 0.12 + 0.3 * smoothstep(-0.06, 0.1, bp.z) + 0.24 * smoothstep(-0.12, -0.5, bp.y);
    else pri = 0.04 + 0.3 * smoothstep(0.0, 0.15, bp.z) - 0.1 * smoothstep(0.05, 0.16, bp.y);
    vec3 q = bp * 7.5 + uSeed + vec3(uZone * 13.7, uZone * 5.3, uZone * 9.1);
    float n = 0.5 + 0.5 * (bsnoise(q) * 0.62 + bsnoise(q * 2.3 + 4.1) * 0.28 + bsnoise(q * 5.7 + 9.7) * 0.1);
    float v = n * 0.7 + pri * 0.45 + bsnoise(bp * 31.0 + uSeed) * 0.035;
    float th = 0.98 - uBlood * 0.48;   // a few spots at first; even soaked, the back and the face are only patchy
    float a = smoothstep(th, th + 0.05, v) * smoothstep(0.0, 0.04, uBlood);
    if (a > 0.001) {
      float core = smoothstep(th + 0.03, th + 0.16, v);   // thicker, darker where it's pooled
      vec3 fresh = mix(vec3(0.45, 0.05, 0.035), vec3(0.3, 0.025, 0.02), core);
      vec3 dried = mix(vec3(0.24, 0.05, 0.035), vec3(0.15, 0.03, 0.022), core);
      vec3 bc = mix(dried, fresh, uFresh);
      diffuseColor.rgb = mix(diffuseColor.rgb, bc, a * mix(0.72, 0.95, core));
    }
  }`;
// a copy of a surface's material that carries the stain; part is the body part it rides on (its frame), zone which one
function bloodMat(orig, mesh, part, zone) {
  const m = orig.clone(), baseC = orig.onBeforeCompile, baseKey = orig.customProgramCacheKey;
  const u = { uPart: { value: new THREE.Matrix4().copy(part.matrixWorld).invert().multiply(mesh.matrixWorld) }, uZone: { value: zone } };
  m.onBeforeCompile = (sh, r) => {
    if (baseC) baseC.call(m, sh, r);
    Object.assign(sh.uniforms, BLOOD_U, u);
    sh.vertexShader = 'uniform mat4 uPart;\nvarying vec3 vBloodP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBloodP = (uPart * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uBlood;\nuniform float uFresh;\nuniform vec3 uSeed;\nuniform float uZone;\nvarying vec3 vBloodP;\n' + BLOOD_NOISE + '\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + BLOOD_FRAG);
  };
  m.customProgramCacheKey = () => (baseKey ? baseKey.call(orig) : '') + '-blood';
  m.userData.bloodOf = orig;
  return m;
}
function buildCharBlood() {
  charBloodDirty = false;
  charBlood.forEach(([, m]) => m.dispose()); charBlood.length = 0;
  PM.g.updateMatrixWorld(true);
  BLOOD_U.uSeed.value.set(rr(0, 40), rr(0, 40), rr(0, 40));
  const held = new Set(Object.values(gunMeshes)), zones = new Map([[PM.torso, 0], [PM.upper, 0], [PM.lower, 3], [PM.armL, 1], [PM.armR, 2], [PM.legL, 3], [PM.legR, 4], [PM.head, 5]]);
  const walk = (o, part, zone) => {
    if (held.has(o) || o.userData.slot !== undefined || o.userData.isOutline) return;
    if (zones.has(o) && o !== PM.upper && o !== PM.lower) { part = o; zone = zones.get(o); }
    if (o.isMesh && !Array.isArray(o.material) && o.material.isMeshLambertMaterial && !o.material.transparent) {
      const orig = o.material.userData.bloodOf || o.material, m = bloodMat(orig, o, part, zone);
      o.material = m; charBlood.push([orig, m]);
    }
    o.children.forEach(c => walk(c, part, zone));
  };
  // the upper body's own pieces (vest, pack, pouches) stain in the chest's frame, the hips' in the left leg's
  PM.upper.children.forEach(c => walk(c, PM.torso, 0)); PM.lower.children.forEach(c => walk(c, PM.legL, 3));
}
// each frame: the stain eases out to how bloody you are (so a hit spreads it rather than popping it on), fresh blood
// brightens it, and the copies keep the colour their originals have now (your shirt, skin and pack are re-dyed each run)
function updateCharBlood(rdt) {
  if (charBloodDirty) buildCharBlood();
  const b = P.blood || 0;
  if (b > bloodWas + 0.001) BLOOD_U.uFresh.value = 1; else BLOOD_U.uFresh.value = Math.max(0, BLOOD_U.uFresh.value - rdt / 40);
  bloodWas = b;
  bloodShown += (b - bloodShown) * Math.min(1, rdt * (b > bloodShown ? 2.2 : 0.6));
  BLOOD_U.uBlood.value = bloodShown;
  for (const [o, m] of charBlood) { if (!m.color.equals(o.color)) m.color.copy(o.color); if (o.emissive && !m.emissive.equals(o.emissive)) m.emissive.copy(o.emissive); }
}
