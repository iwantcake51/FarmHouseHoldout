// Laser sight beam: from the laser's lens on the gun to the point the bullets go, at the height you're aiming at.
// The taped-on pointer is red; the mounted laser sight (tier 2) is a brighter green.

// the beam is a ribbon turned to face the camera (so it reads the same from any angle), shaded as light rather than a
// stick: a thin white-hot core inside a soft coloured glow that shimmers along its length, dust motes drifting out
// along it catching the light, faded in from the lens. It's drawn additively, so it brightens whatever it crosses
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
uniform vec3 uCol; uniform float uT, uOp; varying vec2 vUv; varying float vLen;
float h1(float n) { return fract(sin(n) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  float x = abs(vUv.x - 0.5) * 2.0, d = vUv.y * vLen;            // across the ribbon (0 the middle), metres along the beam
  float core = exp(-x * x * 55.0), glow = exp(-x * x * 6.0);
  float shimmer = 0.72 + 0.28 * n1(d * 2.3 - uT * 6.0);
  float motes = pow(n1(d * 7.0 - uT * 1.6), 9.0) * 3.0 + pow(n1(d * 13.0 + 31.0 - uT * 2.4), 12.0) * 2.0;
  float ends = smoothstep(0.0, 0.12, d) * (1.0 - 0.35 * smoothstep(vLen * 0.6, vLen, d));
  float a = (core * 1.15 + glow * (0.42 * shimmer + motes * 0.6)) * ends * uOp;
  gl_FragColor = vec4(mix(uCol, vec3(1.0), core * 0.75), a);
}`;
// the dot where it lands and the glint at the lens: a coloured halo round a white-hot point, pulsing a little
const TEX_LDOT = glowTex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.9)'); g.addColorStop(0.3, 'rgba(255,255,255,0.32)'); g.addColorStop(0.6, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
const glowSprite = () => new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_LDOT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
// one beam per gun: an akimbo pair has a laser on each, each running from its own gun to where that gun's shots go
const mkBeam = () => {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 24).rotateX(Math.PI / 2).translate(0, 0, 0.5);   // x across, z along (0-1)
  const b = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: LASER_VS, fragmentShader: LASER_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(0xff3a24) }, uT: { value: 0 }, uOp: { value: 1 }, uW: { value: 0.08 } } }));
  b.frustumCulled = false;
  const d = new THREE.Group(), halo = glowSprite(), core = glowSprite(), lens = glowSprite();
  core.material.color.set(0xffffff); d.add(halo, core);
  b.visible = d.visible = lens.visible = false; scene.add(b, d, lens); return { b, d, halo, core, lens };
};
const BEAMS = { R: mkBeam(), L: mkBeam() };
const _lsA = new V3(), _lsB = new V3(), LASER_COL = { 1: [0xff3a24, 0xff5a3a], 2: [0x3cff5a, 0x7dff8e] };
function updateLaser(D) {
  const gunOut = !scoped && state === 'play' && !P.dead && T('laser') > 0 && !D.melee && !P.vault && !swapSt;
  for (const side of ['R', 'L']) {
    // a lone gun's goes off while it's reloaded; an akimbo gun's only while that gun is (weapons/akimbo.js)
    const B = BEAMS[side], on = gunOut && (D.akimbo ? !akBusy(side) : side === 'R' && !W8.reloading);
    B.b.visible = B.d.visible = B.lens.visible = on;
    if (on) beam(B, D, side);
  }
}
function beam(B, D, side) {
  const { b: laser, d: laserDot } = B, tier = T('laser'), col = LASER_COL[tier] || LASER_COL[1], u = laser.material.uniforms, t = performance.now() / 1000;
  if (u.uCol.value.getHex() !== col[0]) { u.uCol.value.setHex(col[0]); B.halo.material.color.setHex(col[1]); B.lens.material.color.setHex(col[1]); }
  // the far end: along the bullets' line, as far as they'd go, at the height of what's under the crosshair
  const mz = muzzle(D.akimbo ? (side === 'L' ? -1 : 1) : 0), dx = Math.sin(mz.a), dz = Math.cos(mz.a), L = aimRay(mz.ox, mz.oz, mz.a, 18).L;
  _lsB.set(mz.ox + dx * L, Math.min(GUN_Y, ANIM.aimY || GUN_Y), mz.oz + dz * L);
  // the near end: the lens of the laser on the gun in that hand
  const h = HOLDS[W8.cur] && HOLDS[W8.cur][side], em = h && h.userData.laserEm;
  if (em) { em.updateWorldMatrix(true, false); em.getWorldPosition(_lsA); } else _lsA.set(mz.ox, GUN_Y, mz.oz);
  // the taped-on pointer is a thinner, dimmer red; the mounted module a brighter, wider green
  laser.position.copy(_lsA); laser.lookAt(_lsB); laser.scale.set(1, 1, Math.max(0.01, _lsA.distanceTo(_lsB)));
  u.uT.value = t + (side === 'L' ? 17.3 : 0); u.uW.value = tier === 2 ? 0.13 : 0.1; u.uOp.value = (tier === 2 ? 0.85 : 0.62) * (0.94 + 0.06 * Math.sin(t * 41 + (side === 'L' ? 2 : 0)));
  // the dot pulses a little, its halo breathing round a hard point; the lens glints
  const pulse = 1 + 0.14 * Math.sin(t * 8.5 + (side === 'L' ? 1.7 : 0)) + 0.05 * Math.sin(t * 23);
  laserDot.position.copy(_lsB); B.halo.scale.setScalar((tier === 2 ? 0.42 : 0.34) * pulse); B.core.scale.setScalar(tier === 2 ? 0.1 : 0.08);
  B.halo.material.opacity = tier === 2 ? 0.95 : 0.8;
  B.lens.position.copy(_lsA); B.lens.scale.setScalar((tier === 2 ? 0.16 : 0.12) * (0.9 + 0.1 * pulse));
}
