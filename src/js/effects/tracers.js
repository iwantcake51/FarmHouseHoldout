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
