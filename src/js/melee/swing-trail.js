// Motion-blur ribbon behind melee swings.

// The weapon's place is taken every frame through the fast part of a swing (MSWINGS' fast): a point part way up it
// and its tip. Between those samples the ribbon is drawn on a smooth curve through them (Catmull-Rom, SW_SUB pieces
// to a frame), so it sweeps round in an arc however few frames there are, never in straight facets. How strongly it
// shows goes with how fast the head was moving there (SW_FAST: the speed it's full at), so the wind-up and the
// recovery hardly smear and the blow itself does; it's faint at the base and strongest just in from the tip,
// feathered off at both edges and along its tail, and each sample fades over SW_LIFE
const TRAIL_N = 16, SW_SUB = 4, SW_COLS = (TRAIL_N - 1) * SW_SUB + 1, SW_LIFE = 0.13, SW_FAST = 9;
const MLEN = { bat: 0.95, crowbar: 0.82, wrench: 0.72, katana: 1.08, sledge: 0.98, machete: 0.78, axe: 0.92 };
// a blade grown by its mod's level (melee/melee-models.js) leaves a trail as long as it is
const meleeLen = id => (MLEN[id] || 0.85) + (id === 'machete' && hasMod('longblade') ? 0.66 * (MACHETE_S[modLv('longblade')] - 1) : id === 'katana' && hasMod('folded') ? KATANA_L[modLv('folded')] - KATANA_L[0] : 0);
const swGeo = new THREE.BufferGeometry(), swPos = new Float32Array(SW_COLS * 6), swAl = new Float32Array(SW_COLS * 2), swV = new Float32Array(SW_COLS * 2);
swGeo.setAttribute('position', new THREE.BufferAttribute(swPos, 3));
swGeo.setAttribute('alpha', new THREE.BufferAttribute(swAl, 1));
swGeo.setAttribute('across', new THREE.BufferAttribute(swV, 1));
{ const ix = []; for (let k = 0; k < SW_COLS - 1; k++) { const a = k * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } swGeo.setIndex(ix); }
const trailMat = new THREE.ShaderMaterial({
  uniforms: { uCol: { value: new THREE.Color(0xe6ebee) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: 'attribute float alpha; attribute float across; varying float vA; varying float vX; void main() { vA = alpha; vX = across; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  // across the ribbon (vX: 0 at the base, 1 at the tip): rising toward the tip, feathered off its very edge
  fragmentShader: 'uniform vec3 uCol; varying float vA; varying float vX; void main() { float x = clamp(vX, 0.0, 1.0); float a = vA * smoothstep(0.0, 0.75, x) * (1.0 - smoothstep(0.86, 1.0, x)); gl_FragColor = vec4(uCol, a); }'
});
const trail = new THREE.Mesh(swGeo, trailMat);
trail.frustumCulled = false;
trail.renderOrder = 3;
trail.visible = false;
scene.add(trail);
const trailS = [];
const _cr = (p0, p1, p2, p3, t, o, k) => { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3); };
function stepTrail(rdt) {
  const id = curId(), D = id && W(id);
  for (const q of trailS) q.age += rdt;
  while (trailS.length && trailS[0].age > SW_LIFE) trailS.shift();
  if (D && D.melee && W8.swing > 0 && !P.dead && rdt > 0) {
    const p = 1 - W8.swing / W8.swingDur;
    const fw = curSwing(D).fast;
    if (p > fw[0] && p < fw[1]) {   // only the fast part of the swing smears (MSWINGS' fast)
      const g = gunMeshes.melee, L = meleeLen(id); PM.g.updateMatrixWorld(true);
      const s = trailS.length >= TRAIL_N ? trailS.shift() : { b: new V3(), t: new V3() };
      s.b.set(0, L * 0.35, 0); s.t.set(0, L, 0); g.localToWorld(s.b); g.localToWorld(s.t); s.age = 0;
      const last = trailS[trailS.length - 1];
      s.v = last ? clamp(s.t.distanceTo(last.t) / rdt / SW_FAST, 0, 1) : 0;   // (how fast the head was going)
      trailS.push(s);
      trailMat.uniforms.uCol.value.setHex(D.blunt ? 0xd8d2c6 : 0xeef3f6);
    }
  }
  const n = trailS.length; trail.visible = n >= 2; if (!trail.visible) return;
  const str = (W8.tired ? 0.3 : 0.58) * (D && heavySwing(D) ? 1.25 : 1);
  // each sample's strength: its speed, fading with its age, and along the ribbon from the tail (oldest) to the weapon
  const al = trailS.map((q, k) => str * Math.max(q.v, k ? trailS[k - 1].v * 0.6 : 0) * Math.pow(1 - q.age / SW_LIFE, 1.5) * Math.pow(k / (n - 1), 1.2));
  const at = k => trailS[clamp(k, 0, n - 1)];
  let c = 0;
  for (let k = 0; k < n - 1; k++) {
    const q0 = at(k - 1), q1 = at(k), q2 = at(k + 1), q3 = at(k + 2);
    for (let j = 0; j < SW_SUB && c < SW_COLS; j++, c++) {
      const t = j / SW_SUB, o = c * 6;
      for (let a = 0; a < 3; a++) {
        const key = 'xyz'[a];
        swPos[o + a] = _cr(q0.b, q1.b, q2.b, q3.b, t, o, key); swPos[o + 3 + a] = _cr(q0.t, q1.t, q2.t, q3.t, t, o, key);
      }
      const A = al[k] + (al[k + 1] - al[k]) * t; swAl[c * 2] = A; swAl[c * 2 + 1] = A; swV[c * 2] = 0; swV[c * 2 + 1] = 1;
    }
  }
  // the last column, at the weapon itself, and the rest folded onto it, unseen
  for (; c < SW_COLS; c++) { const q = at(n - 1), o = c * 6; swPos[o] = q.b.x; swPos[o + 1] = q.b.y; swPos[o + 2] = q.b.z; swPos[o + 3] = q.t.x; swPos[o + 4] = q.t.y; swPos[o + 5] = q.t.z; swAl[c * 2] = swAl[c * 2 + 1] = c === (n - 1) * SW_SUB ? al[n - 1] : 0; swV[c * 2] = 0; swV[c * 2 + 1] = 1; }
  swGeo.attributes.position.needsUpdate = true; swGeo.attributes.alpha.needsUpdate = true; swGeo.attributes.across.needsUpdate = true;
}
