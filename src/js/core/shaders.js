// The light-map shader patch every lit material uses (light, vision, wall cut-away) and foliage wind.

const LMU = { uLightMap: { value: null }, uLmSize: { value: N }, uLmHalf: { value: HALF }, uUnseen: { value: 0.85 }, uPScr: { value: new THREE.Vector2(-9999, -9999) }, uRad: { value: 120 } };
const VERT_DECL = 'varying vec2 vLmUv;\nuniform float uLmSize;\nuniform float uLmHalf;\n';
const VERT_BODY = `
  vec4 lmW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  lmW = instanceMatrix * lmW;
  #endif
  lmW = modelMatrix * lmW;
  vLmUv = vec2((lmW.x + uLmHalf) / uLmSize, (lmW.z + uLmHalf) / uLmSize);`;
const FRAG_DECL = 'varying vec2 vLmUv;\nuniform sampler2D uLightMap;\nuniform float uUnseen;\n';
const FRAG_BODY = `
  vec4 lmS = texture2D(uLightMap, vLmUv);
  vec3 lmC = gl_FragColor.rgb * lmS.rgb * 2.0;
  float lmL = smoothstep(0.16, 0.5, dot(lmS.rgb, vec3(0.299, 0.587, 0.114)) * 2.0);
  lmC *= mix(mix(uUnseen, 0.92, lmL), 1.0, lmS.a);
  float lmG = dot(lmC, vec3(0.299, 0.587, 0.114));
  gl_FragColor.rgb = mix(vec3(lmG), lmC, mix(mix(0.12, 0.4, lmS.a), 1.0, lmL));`;
const CUT_DECL = 'uniform float uCut;\nuniform vec2 uPScr;\nuniform float uRad;\nfloat bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }\n';
const CUT_BODY = `
  if (uCut > 0.001) {
    float hole = smoothstep(uRad * 0.5, uRad, distance(gl_FragCoord.xy, uPScr));
    float keep = mix(1.0, mix(0.0, 0.34, hole), uCut);
    float th = bayer2(0.5 * gl_FragCoord.xy) * 0.25 + bayer2(gl_FragCoord.xy);
    if (th >= keep) discard;
  }
  #include <clipping_planes_fragment>`;
function lit(mat, cut) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uLightMap: LMU.uLightMap, uLmSize: LMU.uLmSize, uLmHalf: LMU.uLmHalf, uUnseen: LMU.uUnseen });
    sh.vertexShader = VERT_DECL + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    let f = FRAG_DECL + sh.fragmentShader.replace('#include <fog_fragment>', FRAG_BODY + '\n#include <fog_fragment>');
    if (cut) {
      Object.assign(sh.uniforms, { uCut: mat.userData.cut, uPScr: LMU.uPScr, uRad: LMU.uRad });
      f = CUT_DECL + f.replace('#include <clipping_planes_fragment>', CUT_BODY);
    }
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => cut ? 'lit-cut' : 'lit';
  return mat;
}
const lam = (c, extra) => lit(new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {})));
const WIND = { value: 0 };
// instanced foliage sways in the wind; the higher up a vertex sits the more it moves
function windy(mat, amp) {
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    base(sh, r); sh.uniforms.uWind = WIND;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz; float hh = max(0.0, ip.y + transformed.y * 0.9);
  float ph = uWind + ip.x * 0.37 + ip.z * 0.23;
  float gust = 0.6 + 0.4 * sin(uWind * 0.31 + ip.x * 0.05);
  transformed.x += (sin(ph) * 0.7 + sin(ph * 2.3) * 0.3) * ${amp.toFixed(4)} * hh * gust;
  transformed.z += cos(ph * 0.8) * ${(amp * 0.5).toFixed(4)} * hh * gust;
#endif`);
  };
  mat.customProgramCacheKey = () => 'lit-wind-' + amp;
  return mat;
}
const basic = c => new THREE.MeshBasicMaterial({ color: c });
const relit = m => lit(m.clone());
