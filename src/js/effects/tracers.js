// Bullet tracers.

const tracers = [];
const tracerColor = new THREE.Color(0xffe2a8);
const TR_G = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
// unit box running from its origin along +z
for (let k = 0; k < 48; k++) {
  const core = new THREE.Mesh(TR_G, new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  const trail = new THREE.Mesh(TR_G, new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.visible = trail.visible = false; scene.add(core, trail); tracers.push({ core, trail, t: 0, dur: 0.05, fade: 0, L: 0, s: new V3(), e: new V3(), w: 1 });
}
// a bright slug streaks from the muzzle to whatever it hits, leaving a faint hot line that fades behind it
function tracer(x0, y0, z0, x1, y1, z1, heavy) {
  const t = tracers.find(t => t.t <= 0 && t.fade <= 0) || tracers[0];
  t.s.set(x0, y0, z0); t.e.set(x1, y1, z1); t.L = t.s.distanceTo(t.e); if (t.L < 0.05) return;
  t.dur = clamp(t.L / 320, 0.018, 0.075); t.t = t.dur; t.fade = 0.16; t.w = (heavy ? 1.6 : 1) * (1 + T('ammo') * 0.25);
  tracerColor.setHex(T('ammo') >= 2 ? 0xffb070 : 0xfff0c8); t.core.material.color.copy(tracerColor);
  for (const m of [t.core, t.trail]) { m.position.copy(t.s); m.lookAt(t.e); m.visible = true; }
  t.core.scale.set(0.03 * t.w, 0.03 * t.w, 0.01); t.trail.scale.set(0.014 * t.w, 0.014 * t.w, 0.01);
}
function stepTracers(rdt) {
  for (const t of tracers) {
    if (t.t <= 0 && t.fade <= 0) continue;
    if (t.t > 0) t.t = Math.max(0, t.t - rdt); else t.fade -= rdt;
    const p = 1 - t.t / t.dur, head = t.L * p, streak = Math.min(t.L, 2.6 + t.L * 0.12), tail = Math.max(0, head - streak);
    if (t.t > 0) { t.core.position.copy(t.s).lerp(t.e, tail / t.L); t.core.scale.z = Math.max(0.01, head - tail); t.core.material.opacity = 1; }
    else { t.core.material.opacity = Math.max(0, t.fade / 0.16 - 0.5) * 2; t.core.position.copy(t.s).lerp(t.e, Math.max(0, 1 - streak * 0.5 / t.L)); t.core.scale.z = Math.max(0.01, Math.min(streak * 0.5, t.L)); }
    t.trail.scale.z = Math.max(0.01, head); t.trail.material.opacity = 0.22 * (t.t > 0 ? 1 : Math.max(0, t.fade / 0.16));
    if (t.t <= 0 && t.fade <= 0) t.core.visible = t.trail.visible = false;
  }
}
// ---- smoke trails: heavy rounds leave a thin grey line through the air that widens, drifts up and thins out ----
const TRAIL_TEX = (() => {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const x = c.getContext('2d'), im = x.createImageData(32, 128);
  for (let v = 0; v < 128; v++) for (let u = 0; u < 32; u++) {
    const across = Math.pow(Math.sin(Math.PI * (u + 0.5) / 32), 2), ends = Math.min(1, v / 12, (127 - v) / 30), n = 0.7 + 0.3 * Math.sin(v * 0.37 + Math.sin(v * 0.11) * 3);
    const i = (v * 32 + u) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = 255 * across * ends * n;
  }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); return t;
})();
const TRAIL_G = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
const trails = [];
for (let k = 0; k < 24; k++) { const m = new THREE.Mesh(TRAIL_G, new THREE.MeshBasicMaterial({ map: TRAIL_TEX, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 3; scene.add(m); trails.push({ m, life: 0, max: 1, a: 0, w0: 0.05, mx: 0, mz: 0 }); }
// strength 0..1: how thick and how long it hangs (a hunting rifle 1, a revolver a bit less, rifle-calibre automatics about half)
function smokeTrail(x0, y0, z0, x1, y1, z1, strength) {
  const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.6 || !strength) return;
  const t = trails.reduce((a, b) => b.life < a.life ? b : a);
  t.m.position.set(x0, (y0 + y1) / 2, z0); t.m.rotation.set(0, Math.atan2(x1 - x0, z1 - z0), 0); t.m.scale.set(0.05, 1, L); t.m.visible = true;
  t.max = t.life = 0.9 + 1.3 * strength; t.a = 0.18 + 0.2 * strength; t.w0 = 0.04 + 0.04 * strength; t.mx = (x0 + x1) / 2; t.mz = (z0 + z1) / 2;
}
function stepTrails(dt) {
  for (const t of trails) {
    if (t.life <= 0) continue; t.life -= dt; if (t.life <= 0) { t.m.visible = false; continue; }
    const k = 1 - t.life / t.max;
    t.m.scale.x = t.w0 + k * 0.32; t.m.position.y += dt * 0.12;
    t.m.material.opacity = t.a * Math.min(1, k * 14) * Math.pow(1 - k, 1.4);
    t.m.material.color.setHex(0xc9c4ba).multiplyScalar(Math.min(1.1, 0.14 + lightLevelAt(t.mx, t.mz) * 0.85));
  }
}
