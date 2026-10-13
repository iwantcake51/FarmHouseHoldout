// The light-map shader patch every lit material uses (light, vision, wall cut-away, the blood on the ground and walls)
// and foliage wind.

const LMU = { uLightMap: { value: null }, uLmSize: { value: N }, uLmHalf: { value: HALF }, uUnseen: { value: 0.85 }, uPScr: { value: new THREE.Vector2(-9999, -9999) }, uRad: { value: 120 }, uPZ: { value: 0 },
  // cloud shade drifting over the farm (offset x, z and how strong; world/atmosphere.js drives it), the house it
  // doesn't reach into, and where the farm starts to fade into the woods and the haze (from / to, metres out)
  uCloud: { value: new THREE.Vector3() }, uHouse: { value: new THREE.Vector4(-1e3, -1e3, -1e3, -1e3) }, uEdge: { value: new THREE.Vector2(HALF + 0.5, HALF + 14) } };
const VERT_DECL = 'varying vec2 vLmUv;\nvarying vec3 vWp;\nvarying vec3 vWn;\nuniform float uLmSize;\nuniform float uLmHalf;\n';
const VERT_BODY = `
  vec4 lmW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  lmW = instanceMatrix * lmW;
  #endif
  lmW = modelMatrix * lmW;
  vLmUv = vec2((lmW.x + uLmHalf) / uLmSize, (lmW.z + uLmHalf) / uLmSize);
  vWp = lmW.xyz;
  vec3 lmN = objectNormal;
  #ifdef USE_INSTANCING
  lmN = mat3(instanceMatrix) * lmN;
  #endif
  vWn = normalize(mat3(modelMatrix) * lmN);`;
const FRAG_DECL = 'varying vec2 vLmUv;\nvarying vec3 vWp;\nvarying vec3 vWn;\nuniform sampler2D uLightMap;\nuniform float uUnseen;\nuniform sampler2D uBloodNoise;\nuniform vec3 uCloud;\nuniform vec4 uHouse;\nuniform vec2 uEdge;\n';
// blood and soot on everything that stays put (the ground, floors, walls, fences, trees, crates, furniture), read from
// the farm's blood map (effects/blood-map.js): red is blood, green how far up walls and trunks a splash reached, blue
// scorch. Smooth noise in world space breaks its edges up and varies how thick it lies, so it soaks into the ground
// and runs down walls in soft organic stains rather than texels. Things that move (you, zombies, weapons, pickups)
// opt out with userData.mobile, and carry their own stains.
const BMU = { uBloodMap: { value: null }, uBloodNoise: { value: null } };
const WB_DECL = 'uniform sampler2D uBloodMap;\n';
const WB_BODY = `
  {
    vec4 bm = texture2D(uBloodMap, vLmUv);
    if (bm.r + bm.b > 0.004 && vLmUv.x > 0.0 && vLmUv.x < 1.0 && vLmUv.y > 0.0 && vLmUv.y < 1.0) {
      float vert = 1.0 - smoothstep(0.45, 0.8, abs(vWn.y)), y = vWp.y;
      vec2 bq = vWp.xz * 0.55 + y * vec2(0.31, 0.17);
      float nz = texture2D(uBloodNoise, bq).r * 0.62 + texture2D(uBloodNoise, bq * 2.7 + 0.37).r * 0.38;
      float reach = 0.3 + bm.g * 2.0;   // how high a splash went: pools stay at the foot of things, sprays go up them
      // lying flat (the ground, a floor, a porch board, a low crate's top): soaked in, thick where it pooled
      float aFlat = smoothstep(0.12, 0.3, bm.r * (0.55 + nz * 0.9)) * smoothstep(reach, reach - 0.15, y);
      // up a wall, a fence post or a trunk: specks and blobs of spatter (thicker low down), thin runs dripping down
      // from it, and a soaked band at the foot where a pool lies against it
      float wt = dot(vWp.xz, vec2(abs(vWn.z), abs(vWn.x)));
      float sp = texture2D(uBloodNoise, vec2(wt * 1.7, y * 1.7) + 0.11).r * 0.6 + texture2D(uBloodNoise, vec2(wt * 4.6, y * 4.6) + 0.53).r * 0.4;
      float dens = bm.r * smoothstep(reach + 0.05, reach * 0.45, y);
      float spat = smoothstep(0.76 - dens * 0.36, 0.79 - dens * 0.36, sp) * step(0.04, dens);
      float top = reach * (0.4 + 0.55 * texture2D(uBloodNoise, vec2(wt * 2.9, 0.71)).r), len = 0.12 + 0.6 * texture2D(uBloodNoise, vec2(wt * 5.3, 0.9)).r;
      float drip = smoothstep(0.63, 0.66, texture2D(uBloodNoise, vec2(wt * 9.0, 0.29)).r) * smoothstep(top, top - 0.03, y) * smoothstep(top - len - 0.03, top - len, y) * smoothstep(0.1, 0.3, bm.r);
      float foot = smoothstep(0.3, 0.05, y + (nz - 0.5) * 0.14) * smoothstep(0.2, 0.5, bm.r);
      float a = mix(aFlat, max(max(spat, drip * 0.9), foot), vert);
      float pool = smoothstep(0.45, 0.9, bm.r * (0.6 + nz * 0.6)) * (1.0 - vert);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.38, 0.04, 0.03), vec3(0.2, 0.022, 0.015), pool), a * 0.92);
      float soot = smoothstep(0.1, 0.5, bm.b * (0.6 + nz * 0.8)) * smoothstep(1.6, 0.5, y);
      diffuseColor.rgb *= 1.0 - soot * 0.78;
    }
  }`;
const FRAG_BODY = `
  vec4 lmS = texture2D(uLightMap, vLmUv);
  vec3 lmC = gl_FragColor.rgb * lmS.rgb * 2.0;
  float lmL = smoothstep(0.16, 0.5, dot(lmS.rgb, vec3(0.299, 0.587, 0.114)) * 2.0);
  lmC *= mix(mix(uUnseen, 0.92, lmL), 1.0, lmS.a);
  float lmG = dot(lmC, vec3(0.299, 0.587, 0.114));
  gl_FragColor.rgb = mix(vec3(lmG), lmC, lmL);   // colour only where there's light: the dark goes black and white
  // clouds passing over: their shade drifts across the farm by day (not indoors)
  if (uCloud.z > 0.001) {
    vec2 cq = vWp.xz * 0.022 + uCloud.xy;
    float cs = texture2D(uBloodNoise, cq).r * 0.65 + texture2D(uBloodNoise, cq * 2.3 + 0.5).r * 0.35;
    float inH = step(uHouse.x, vWp.x) * step(vWp.x, uHouse.z) * step(uHouse.y, vWp.z) * step(vWp.z, uHouse.w);
    gl_FragColor.rgb *= 1.0 - uCloud.z * smoothstep(0.46, 0.72, cs) * (1.0 - inH);
  }`;
// past the edge of the farm everything thins into the haze, so the woods go on into the distance instead of stopping
const EDGE_BODY = `
  #ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * 0.9, smoothstep(uEdge.x, uEdge.y, max(abs(vWp.x), abs(vWp.z))) * 0.9);
  #endif`;
const CUT_DECL = 'uniform float uCut;\nuniform vec2 uPScr;\nuniform float uRad;\nfloat bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }\n';
const CUT_BODY = `
  if (uCut > 0.001) {
    float hole = smoothstep(uRad * 0.5, uRad, distance(gl_FragCoord.xy, uPScr));
    float keep = mix(1.0, mix(0.0, 0.34, hole), uCut);
    float th = bayer2(0.5 * gl_FragCoord.xy) * 0.25 + bayer2(gl_FragCoord.xy);
    if (th >= keep) discard;
  }
  #include <clipping_planes_fragment>`;
// trees: only the parts standing between the camera and you (nearer than you in depth) dither away, in a soft hole round you
const TREE_CUT = { value: 0 };
const TREE_DECL = 'uniform float uTreeCut;\nuniform vec2 uPScr;\nuniform float uRad;\nuniform float uPZ;\nfloat bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }\n';
const TREE_BODY = `
  if (uTreeCut > 0.001 && gl_FragCoord.z < uPZ) {
    float hole = smoothstep(uRad * 0.3, uRad * 0.75, distance(gl_FragCoord.xy, uPScr));
    float keep = mix(1.0, mix(0.1, 1.0, hole), uTreeCut);
    float th = bayer2(0.5 * gl_FragCoord.xy) * 0.25 + bayer2(gl_FragCoord.xy);
    if (th >= keep) discard;
  }
  #include <clipping_planes_fragment>`;
function lit(mat, cut) {
  mat.onBeforeCompile = function (sh) {
    const self = this || mat, wb = !self.userData.mobile;
    Object.assign(sh.uniforms, { uLightMap: LMU.uLightMap, uLmSize: LMU.uLmSize, uLmHalf: LMU.uLmHalf, uUnseen: LMU.uUnseen, uBloodNoise: BMU.uBloodNoise, uCloud: LMU.uCloud, uHouse: LMU.uHouse, uEdge: LMU.uEdge });
    sh.vertexShader = VERT_DECL + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    let f = FRAG_DECL + sh.fragmentShader.replace('#include <fog_fragment>', FRAG_BODY + '\n#include <fog_fragment>\n' + EDGE_BODY);
    if (wb) { Object.assign(sh.uniforms, { uBloodMap: BMU.uBloodMap }); f = WB_DECL + f.replace('#include <color_fragment>', '#include <color_fragment>\n' + WB_BODY); }
    if (cut === 'tree') {
      Object.assign(sh.uniforms, { uTreeCut: TREE_CUT, uPScr: LMU.uPScr, uRad: LMU.uRad, uPZ: LMU.uPZ });
      f = TREE_DECL + f.replace('#include <clipping_planes_fragment>', TREE_BODY);
    } else if (cut) {
      Object.assign(sh.uniforms, { uCut: mat.userData.cut, uPScr: LMU.uPScr, uRad: LMU.uRad });
      f = CUT_DECL + f.replace('#include <clipping_planes_fragment>', CUT_BODY);
    }
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = function () { return ((this || mat).userData.mobile ? 'mob-' : '') + (cut === 'tree' ? 'lit-tree' : cut ? 'lit-cut' : 'lit'); };
  return mat;
}
const lam = (c, extra) => lit(new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {})));
const WIND = { value: 0 };
// instanced foliage sways in the wind; the higher up a vertex sits the more it moves
function windy(mat, amp) {
  const base = mat.onBeforeCompile, baseKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (sh, r) {
    base.call(this || mat, sh, r); sh.uniforms.uWind = WIND;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz; float hh = max(0.0, ip.y + transformed.y * 0.9);
  float ph = uWind + ip.x * 0.37 + ip.z * 0.23;
  float gust = 0.6 + 0.4 * sin(uWind * 0.31 + ip.x * 0.05);
  transformed.x += (sin(ph) * 0.7 + sin(ph * 2.3) * 0.3) * ${amp.toFixed(4)} * hh * gust;
  transformed.z += cos(ph * 0.8) * ${(amp * 0.5).toFixed(4)} * hh * gust;
#endif`);
  };
  mat.customProgramCacheKey = function () { return baseKey.call(this || mat) + '-wind-' + amp; };
  return mat;
}
const basic = c => new THREE.MeshBasicMaterial({ color: c });
const relit = m => lit(m.clone());
