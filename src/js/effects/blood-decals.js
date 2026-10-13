// Blood pools, sprays and drops on the ground.

function splatTexture(kind, base, dark) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.translate(64, 64);
  const blob = (px, py, r, col) => { x.fillStyle = col; x.beginPath(); for (let a = 0; a <= 12; a++) { const t = a / 12 * Math.PI * 2, r2 = r * rr(.75, 1.15); x.lineTo(px + Math.cos(t) * r2, py + Math.sin(t) * r2); } x.closePath(); x.fill(); };
  if (kind === 'pool') {
    for (let k = 0; k < 12; k++) blob(rr(-16, 16), rr(-16, 16), rr(10, 22), base);
    for (let k = 0; k < 6; k++) blob(rr(-10, 10), rr(-10, 10), rr(6, 14), dark);
    for (let k = 0; k < 10; k++) { const a = rand() * 6.28, d = rr(36, 54); blob(Math.cos(a) * d, Math.sin(a) * d, rr(1.5, 4), base); }
  } else if (kind === 'spray') {
    blob(-34, 0, rr(13, 17), base); blob(-30, rr(-4, 4), rr(6, 9), dark);
    for (let k = 0; k < 46; k++) {
      const t = Math.pow(rand(), 0.8), px = -30 + t * 88, py = (rand() - .5) * (8 + t * 46), r = (1 - t) * 6 + rr(.8, 2.2);
      x.save(); x.translate(px, py); x.rotate(Math.atan2(py, px + 30) * 0.6); x.scale(1 + t * 2.2, 1); x.fillStyle = rand() < .3 ? dark : base; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore();
    }
  } else {
    blob(0, 0, rr(14, 20), base); blob(rr(-3, 3), rr(-3, 3), 8, dark);
    for (let k = 0; k < 7; k++) { const a = rand() * 6.28, d = rr(24, 44); blob(Math.cos(a) * d, Math.sin(a) * d, rr(2, 5), base); }
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
const decalMat = tex => lam(0xffffff, { map: tex, transparent: true, depthWrite: false, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2 });
const SPLAT = {};
['pool', 'spray', 'drop'].forEach(k => { SPLAT[k] = [0, 1, 2].map(() => decalMat(splatTexture(k, 'rgb(92,14,10)', 'rgb(58,8,6)'))); });
SPLAT.scorch = [0, 1].map(() => decalMat(splatTexture('pool', 'rgb(30,26,22)', 'rgb(12,10,9)')));
const decals = [];
const DG = new THREE.PlaneGeometry(1, 1);
for (let k = 0; k < 300; k++) { const m = new THREE.Mesh(DG, SPLAT.drop[0]); m.visible = false; m.receiveShadow = true; scene.add(m); decals.push({ m, t: 0, dur: 0, s: 1 }); }
let dIdx = 0;
function splat(x, z, kind, size, ang, grow) {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return;
  const d = decals[dIdx = (dIdx + 1) % decals.length], m = d.m, set = SPLAT[kind];
  m.material = set[(rand() * set.length) | 0];
  m.position.set(x, surfaceY(x, z) + 0.026 + (dIdx % 50) * 0.0003, z);
  m.rotation.set(-Math.PI / 2, 0, ang === undefined ? rand() * 6.28 : Math.atan2(-Math.sin(ang), Math.cos(ang)));
  // drawn first of the see-through things, so a fading roof is laid over the blood rather than the blood over the roof
  m.renderOrder = -1; d.s = size; d.t = 0; d.dur = grow || 0.12; m.scale.set(0.01, 0.01, 1); m.visible = true;
}
function spray(x, z, dx, dz, size) { splat(x + dx * size * 0.35, z + dz * size * 0.35, 'spray', size, Math.atan2(dz, dx), 0.08); }
