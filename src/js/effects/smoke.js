// Gun smoke puffs lit by the light map.

// ---- gun smoke: soft puffs that billow out of the muzzle, drift and thin out; lit by whatever light they sit in ----
const smokes = [];
for (let k = 0; k < 90; k++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_SMOKE, transparent: true, depthWrite: false, opacity: 0 })); m.visible = false; scene.add(m); smokes.push({ m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0.2, s1: 1, a: 0.3, spin: 0 }); }
let smIdx = 0;
function smoke(x, y, z, vx, vy, vz, s0, s1, life, a, tint) {
  const p = smokes[smIdx = (smIdx + 1) % smokes.length];
  p.m.position.set(x, y, z); p.vx = vx; p.vy = vy; p.vz = vz; p.s0 = s0; p.s1 = s1; p.life = p.max = life; p.a = a; p.spin = rr(-1.2, 1.2);
  p.m.material.rotation = rand() * 6.28; p.tint = tint || 0xc9c4ba; p.m.visible = true;
}
const _sc = new THREE.Color();
function stepSmoke(dt) {
  for (const p of smokes) {
    if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.m.visible = false; continue; }
    const k = 1 - p.life / p.max, drag = Math.exp(-dt * 3.2);
    p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag + dt * 0.35;
    p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
    const sc = p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - k, 2.2)); p.m.scale.set(sc, sc, 1);
    p.m.material.rotation += p.spin * dt;
    const L = lightLevelAt(p.m.position.x, p.m.position.z);
    p.m.material.color.copy(_sc.setHex(p.tint)).multiplyScalar(Math.min(1.15, 0.12 + L * 0.85));
    p.m.material.opacity = p.a * Math.min(1, k * 8) * (1 - k) * (1 - k * 0.3);
  }
}
const lightLevelAt = (x, z) => { const a = clamp(Math.floor((x + HALF) * FR), 0, FN - 1), b = clamp(Math.floor((z + HALF) * FR), 0, FN - 1), k = (b * FN + a) * 3; return (lmCur[k] + lmCur[k + 1] + lmCur[k + 2]) / 3 + flashAt(x, z) * visCur[k / 3]; };   // (the flashlight's drawn per pixel, so it's added here: lighting/lightmap.js)
