// Motion-blur ribbon behind melee swings.

const TRAIL_N = 16, MLEN = { bat: 0.95, crowbar: 0.82, wrench: 0.72, katana: 1.08, sledge: 0.98, machete: 0.78, axe: 0.92 };
const trailGeo = new THREE.BufferGeometry(), tPos = new Float32Array(TRAIL_N * 6), tAl = new Float32Array(TRAIL_N * 2);
trailGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
trailGeo.setAttribute('alpha', new THREE.BufferAttribute(tAl, 1));
{ const ix = []; for (let k = 0; k < TRAIL_N - 1; k++) { const a = k * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(ix); }
const trailMat = new THREE.ShaderMaterial({
  uniforms: { uCol: { value: new THREE.Color(0xe6ebee) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: 'attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 uCol; varying float vA; void main() { gl_FragColor = vec4(uCol, vA); }'
});
const trail = new THREE.Mesh(trailGeo, trailMat);
trail.frustumCulled = false;
trail.renderOrder = 3;
trail.visible = false;
scene.add(trail);
const trailS = [];
function stepTrail(rdt) {
  const id = curId(), D = id && W(id);
  for (const q of trailS) q.age += rdt;
  while (trailS.length && trailS[0].age > 0.12) trailS.shift();
  if (D && D.melee && W8.swing > 0 && !P.dead) {
    const p = 1 - W8.swing / W8.swingDur;
    if (p > 0.12 && p < 0.75) {   // only the fast part of the swing smears
      const g = gunMeshes.melee, L = MLEN[id] || 0.85; PM.g.updateMatrixWorld(true);
      const b = (trailS.length >= TRAIL_N ? trailS.shift().b : new V3()).set(0, L * 0.4, 0), t = new V3(0, L, 0); g.localToWorld(b); g.localToWorld(t);
      trailS.push({ b, t, age: 0 }); if (trailS.length > TRAIL_N) trailS.shift();
      trailMat.uniforms.uCol.value.setHex(D.blunt ? 0xd8d2c6 : 0xeef3f6);
    }
  }
  const n = trailS.length; trail.visible = n >= 2; if (!trail.visible) return;
  const str = W8.tired ? 0.22 : 0.42;
  for (let k = 0; k < TRAIL_N; k++) {
    const q = trailS[Math.min(k, n - 1)], o = k * 6, live = k < n;
    tPos[o] = q.b.x; tPos[o + 1] = q.b.y; tPos[o + 2] = q.b.z; tPos[o + 3] = q.t.x; tPos[o + 4] = q.t.y; tPos[o + 5] = q.t.z;
    const a = live ? str * (1 - q.age / 0.12) * Math.pow(k / Math.max(1, n - 1), 1.3) : 0;
    tAl[k * 2] = a * 0.1; tAl[k * 2 + 1] = a;
  }
  trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.alpha.needsUpdate = true;
}
