// Laser sight beams: straight out of each laser's lens along its gun's barrel, on the gun in your hands only.
// The taped-on pointer is red; the mounted laser sight (tier 2) is green.

// the beam is a ribbon turned to face the camera (so it reads the same from any angle), shaded as light rather than a
// stick: a thin white-hot core inside a soft coloured glow that shimmers along its length, dust motes drifting out
// along it catching the light, faded in from the lens and out again with distance (LASER_FADE: where it starts to go,
// and where it's gone, in metres). It's drawn additively, so it brightens whatever it crosses
const LASER_VS = `
uniform float uW; varying vec2 vUv; varying float vLen;
void main() {
  vec3 a = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, b = (modelMatrix * vec4(0.0, 0.0, 1.0, 1.0)).xyz;
  vec3 d = b - a; vLen = length(d); d /= max(vLen, 1e-4);
  vec3 toCam = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);   // the camera's back axis, in the world
  vec3 side = normalize(cross(d, toCam) + vec3(1e-5));
  vec3 p = mix(a, b, position.z) + side * position.x * uW;
  vUv = vec2(position.x + 0.5, position.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const LASER_FS = `
uniform vec3 uCol; uniform float uT, uOp; uniform vec2 uFade; varying vec2 vUv; varying float vLen;
float h1(float n) { return fract(sin(n) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  float x = abs(vUv.x - 0.5) * 2.0, d = vUv.y * vLen;            // across the ribbon (0 the middle), metres along the beam
  float core = exp(-x * x * 55.0), glow = exp(-x * x * 6.0);
  float shimmer = 0.72 + 0.28 * n1(d * 2.3 - uT * 6.0);
  float motes = pow(n1(d * 7.0 - uT * 1.6), 9.0) * 3.0 + pow(n1(d * 13.0 + 31.0 - uT * 2.4), 12.0) * 2.0;
  float ends = smoothstep(0.0, 0.12, d) * (1.0 - 0.35 * smoothstep(vLen * 0.6, vLen, d)) * (1.0 - smoothstep(uFade.x, uFade.y, d));
  float a = (core * 1.0 + glow * (0.3 * shimmer + motes * 0.45)) * ends * uOp;
  gl_FragColor = vec4(mix(uCol, vec3(1.0), core * 0.75), a);
}`;
// the dot where it lands and the glint at the lens: a coloured halo round a white-hot point, pulsing a little
const TEX_LDOT = glowTex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.9)'); g.addColorStop(0.3, 'rgba(255,255,255,0.32)'); g.addColorStop(0.6, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
const glowSprite = () => new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_LDOT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
// one beam per gun: an akimbo pair has a laser on each, each running from its own gun to where that gun's shots go
const mkBeam = () => {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 24).rotateX(Math.PI / 2).translate(0, 0, 0.5);   // x across, z along (0-1)
  const b = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: LASER_VS, fragmentShader: LASER_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(0xff3a24) }, uT: { value: 0 }, uOp: { value: 1 }, uW: { value: 0.08 }, uFade: { value: new THREE.Vector2(...LASER_FADE) } } }));
  b.frustumCulled = false;
  const d = new THREE.Group(), halo = glowSprite(), core = glowSprite(), lens = glowSprite();
  core.material.color.set(0xffffff); d.add(halo, core);
  b.visible = d.visible = lens.visible = false; scene.add(b, d, lens); return { b, d, halo, core, lens, len: 0, t: 0 };
};
const LASER_FADE = [6, 11];
// how far the beam reaches: cut short at once by anything that steps into it, but run out to a farther point (off a
// close wall into the open, or switched on) quickly rather than in a blink, LASER_RUN of the gap a second, never slower
// than LASER_MIN metres a second
const LASER_RUN = 20, LASER_MIN = 8, LASER_MAX = LASER_FADE[1] + 0.5;
// each tier's colours (beam, glow) and size: the taped-on pointer a thin, dim red; the mounted module green, about as
// fine and only a little brighter
const LASER_COL = { 1: [0xff3a24, 0xff5a3a], 2: [0x3cff5a, 0x7dff8e] };
const LASER_LOOK = { 1: { w: 0.1, op: 0.62, halo: 0.34, core: 0.08, lens: 0.12, dot: 0.8 }, 2: { w: 0.085, op: 0.5, halo: 0.28, core: 0.065, lens: 0.1, dot: 0.7 } };
// the laser on the gun in your hands shines (both of a pair), straight out of its lens along the barrel wherever the
// gun points, whether it's on the aim, being reloaded or coming out. A gun in its holster or on your back has its laser
// switched off: put away for a vault or a bandage, or carried, it shines nothing. One beam per lens, made as it's first
// needed
const beams = new Map(), _lsA = new V3(), _lsD = new V3(), _lsB = new V3(), _lsQ = new THREE.Quaternion();
const shownInWorld = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
function updateLaser(D) {
  const on = state === 'play' && !P.dead, used = new Set();
  if (on) {
    // the gun in your hands
    const hs = HOLDS[W8.cur], tier = T('laser');
    if (hs && tier > 0 && !D.melee && !scoped) for (const side of ['R', 'L']) { const em = hs[side] && hs[side].userData.laserEm; if (em && em.isObject3D) lens('h' + side, em, tier, used); }
  }
  // co-op: a teammate's too, on the gun they're holding (their copy of it: net/arsenal.js), wherever it points
  if (state === 'play') for (const p of netLink() ? NET.peers.values() : []) {
    const a = p.av; if (!a || !a.held || p.dead) continue;
    for (const s in a.held) { const h = a.held[s]; if (h.laserT > 0 && h.g.visible) h.lasers.forEach((em, i) => lens('p' + p.id + s + i, em, h.laserT, used)); }
  }
  beams.forEach((B, k) => { if (!used.has(k)) B.b.visible = B.d.visible = B.lens.visible = false; });
}
// one lens: shown only if it is (a gun hidden or put away somewhere out of sight has nothing to shine from)
function lens(key, em, tier, used) {
  if (!shownInWorld(em)) return;
  used.add(key);
  let B = beams.get(key); if (!B) { B = mkBeam(); B.ph = beams.size * 7.3; beams.set(key, B); }
  if (!B.b.visible) B.len = 0;   // switched on: it runs out from the lens
  B.b.visible = B.lens.visible = true;
  em.updateWorldMatrix(true, false); em.getWorldPosition(_lsA); _lsD.set(0, 0, 1).applyQuaternion(em.getWorldQuaternion(_lsQ)).normalize();
  beam(B, tier, laserReach(_lsA, _lsD, LASER_MAX));
}
// how far a beam from o along d goes before it meets the ground (or the floor, porch or step), a wall or a zombie
function laserReach(o, d, max) {
  let L = max, hit = false;
  for (let t = 0.04; t < max; t += 0.06) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, g = surfaceY(x, z);
    if (y <= g) { L = d.y < -1e-4 ? Math.min(t, Math.max(0, (o.y - g) / -d.y)) : t; hit = true; break; }
    if (y < 2.4 && (bulletBlocked(x, z) || thinNear(x, z, 0.07))) { L = t; hit = true; break; }
  }
  const h = Math.hypot(d.x, d.z);
  if (h > 1e-3) for (const zb of zombies) {
    const r = zRay(zb, o.x, o.z, d.x / h, d.z / h, 1e-6); if (!r) continue;
    const t = r.t / h, y = o.y + d.y * t; if (t < L && y > 0.05 && y < 1.85 * (zb.T.scale || 1)) { L = t; hit = true; }
  }
  return { L, hit };
}
function beam(B, tier, reach) {
  const { b: laser, d: laserDot } = B, col = LASER_COL[tier] || LASER_COL[1], look = LASER_LOOK[tier] || LASER_LOOK[1], u = laser.material.uniforms, t = performance.now() / 1000, L = reach.L;
  if (u.uCol.value.getHex() !== col[0]) { u.uCol.value.setHex(col[0]); B.halo.material.color.setHex(col[1]); B.lens.material.color.setHex(col[1]); }
  const dt = clamp(t - B.t, 0, 0.1); B.t = t;
  B.len = L <= B.len ? L : Math.min(L, B.len + Math.max((L - B.len) * Math.min(1, dt * LASER_RUN), dt * LASER_MIN));
  _lsB.copy(_lsA).addScaledVector(_lsD, Math.max(0.01, B.len));
  laser.position.copy(_lsA); laser.lookAt(_lsB); laser.scale.set(1, 1, Math.max(0.01, B.len));
  u.uT.value = t + B.ph; u.uW.value = look.w; u.uOp.value = look.op * (0.94 + 0.06 * Math.sin(t * 41 + B.ph));
  // the dot where it lands, pulsing a little, its halo breathing round a hard point: only once the beam's reached what
  // it lands on, and fading with the beam far off. The lens glints
  const pulse = 1 + 0.14 * Math.sin(t * 8.5 + B.ph) + 0.05 * Math.sin(t * 23);
  const dotA = reach.hit ? clamp(1 - (L - B.len) / 0.3, 0, 1) * (1 - smooth(clamp((B.len - LASER_FADE[0]) / (LASER_FADE[1] - LASER_FADE[0]), 0, 1))) : 0;
  laserDot.position.copy(_lsB); B.halo.scale.setScalar(look.halo * pulse); B.core.scale.setScalar(look.core);
  B.halo.material.opacity = look.dot * dotA; B.core.material.opacity = dotA; laserDot.visible = dotA > 0.01;
  B.lens.position.copy(_lsA); B.lens.scale.setScalar(look.lens * (0.9 + 0.1 * pulse));
}
