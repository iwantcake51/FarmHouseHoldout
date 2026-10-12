// Glowing window panes at night.

// window panes glow warm from inside after dark
const paneGlow = [];
openings.forEach(o => { if (o.kind !== 'window') return; const m = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.78), new THREE.MeshBasicMaterial({ color: 0xff9440, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set(0, 1.44, 0); o.bg.add(m); paneGlow.push({ o, m }); });
