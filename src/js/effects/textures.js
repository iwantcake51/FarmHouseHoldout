// Procedural glow, star, flame and smoke textures.

// ---- muzzle flash: a hot core, a four-point star that faces you, and two crossed flame tongues along the barrel ----
function glowTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); return t; }
const TEX_CORE = glowTex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.25, 'rgba(255,226,150,0.95)'); g.addColorStop(0.6, 'rgba(255,140,40,0.35)'); g.addColorStop(1, 'rgba(255,90,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
const TEX_STAR = glowTex(128, 128, x => {
  x.translate(64, 64);
  for (let k = 0; k < 4; k++) { x.save(); x.rotate(k * Math.PI / 2 + (k % 2 ? 0.12 : 0)); const g = x.createLinearGradient(0, 0, 0, -62); g.addColorStop(0, 'rgba(255,240,190,1)'); g.addColorStop(0.5, 'rgba(255,170,70,0.6)'); g.addColorStop(1, 'rgba(255,110,30,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(-9, 0); x.quadraticCurveTo(-2, -30, 0, -62); x.quadraticCurveTo(2, -30, 9, 0); x.closePath(); x.fill(); x.restore(); }
});
const TEX_TONGUE = glowTex(32, 128, x => { const g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.35, 'rgba(255,190,90,0.85)'); g.addColorStop(0.75, 'rgba(255,110,30,0.3)'); g.addColorStop(1, 'rgba(255,80,20,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(4, 128); x.quadraticCurveTo(0, 40, 16, 0); x.quadraticCurveTo(32, 40, 28, 128); x.closePath(); x.fill(); });
const TEX_SMOKE = glowTex(64, 64, x => { for (let k = 0; k < 7; k++) { const cx = 32 + rr(-9, 9), cy = 32 + rr(-9, 9), r = rr(14, 24), g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); } });
const addMat = (map, op) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: op || 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
