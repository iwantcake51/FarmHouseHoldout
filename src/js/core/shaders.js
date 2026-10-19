// The light-map shader patch every lit material uses (light, vision, wall cut-away, the blood on the ground and walls)
// and foliage wind.

const LMU = { uLightMap: { value: null }, uLmSize: { value: N }, uLmHalf: { value: HALF }, uUnseen: { value: 0.85 }, uPScr: { value: new THREE.Vector2(-9999, -9999) }, uRad: { value: 120 }, uPZ: { value: 0 },
  // how far your eyes have got used to the dark (lighting/day-night.js): it lifts the black-and-white dark a little
  uAdapt: { value: 0 },
  // night vision (lighting/lightmap.js): how much it lifts the black-and-white dark, and how much of the colour it
  // brings back there (a little through the monocular, more through the goggles, never all of it)
  uNvMono: { value: 0 }, uNvSat: { value: 0 },
  // cloud shade drifting over the farm (offset x, z and how strong; world/atmosphere.js drives it), the house it
  // doesn't reach into, and where the farm starts to fade into the woods and the haze (from / to, metres out)
  uCloud: { value: new THREE.Vector3() }, uHouse: { value: new THREE.Vector4(-1e3, -1e3, -1e3, -1e3) }, uEdge: { value: new THREE.Vector2(HALF + 0.5, HALF + 12) },
  // the weapon lights, drawn here per pixel rather than baked into the light map (lighting/lightmap.js, flashUniforms):
  // up to FL_N beams (yours, two for an akimbo pair, and in co-op your teammates'), each one's origin and direction
  // (x, z, dx, dz) and its (reach, half-angle, strength, the angle its shadow rays are centred on); uFlK.w how many
  uFl: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uFlP: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uFlK: { value: new THREE.Vector4() },
  // and their shadows: how far each ray across each beam got before something stopped it (a row a beam: flashShadows)
  uFlSh: { value: null } };
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
// one flashlight beam's light on a point: a soft-rimmed cone, brightest down its middle, falling off with distance (as
// the baked light map did, but per pixel, so the rim is a smooth curve and it swings round with you every frame). Close
// to the lens it spills a little all round. It stops where its ray across the beam was stopped (row: the beam's row of
// the shadow texture, a0 and h the angle its rays are centred on and how far either side they go), a clean edge past a
// window frame or a corner. Past the middle line of a window (tw, how far out its ray crossed it) the beam only goes on
// where it passed between the sill and the head: a beam from gun height through a window only just over the sill
// lights what stands up outside, not the ground just under it or the top of the wall over it
const FL_MAX = 22;   // how far a flashlight's shadow rays go (metres): the longest beam's reach and a little over
const FL_WIN = [1.02, 1.87];   // a window's opening, sill to head (world/house.js)
const FL_FN = `
float flCone(vec4 f, vec4 k, vec2 p, float row) {
  vec2 d = p - f.xy; float r = length(d), a0 = k.w, h = k.y + 0.3;
  float a = acos(clamp(dot(d / max(r, 1e-3), f.zw), -1.0, 1.0));
  float cone = (1.0 - smoothstep(k.y - 0.2, k.y + 0.05, a)) * (1.0 + 0.5 * (1.0 - smoothstep(0.0, k.y * 0.6, a)));
  float fall = 1.0 - clamp(r / k.x, 0.0, 1.0);
  float rel = mod(atan(d.x, d.y) - a0 + 9.424778, 6.283185) - 3.141593;
  vec4 sh = texture2D(uFlSh, vec2(clamp((rel + h) / (2.0 * h), 0.0, 1.0), row));
  float reach = sh.r * ${FL_MAX.toFixed(1)}, tw = sh.g * ${FL_MAX.toFixed(1)};
  float lit = r < 0.7 ? 1.0 : 1.0 - smoothstep(reach - 0.08, reach + 0.08, r);
  float hw = ${GUN_Y.toFixed(2)} + (vWp.y - ${GUN_Y.toFixed(2)}) * tw / max(r, 1e-3);   // how high its line from the lens crossed the window
  float gap = smoothstep(${FL_WIN[0].toFixed(2)} - 0.03, ${FL_WIN[0].toFixed(2)} + 0.03, hw) * (1.0 - smoothstep(${FL_WIN[1].toFixed(2)} - 0.03, ${FL_WIN[1].toFixed(2)} + 0.03, hw));
  lit *= mix(1.0, gap, smoothstep(tw - 0.02, tw + 0.1, r));
  return mix(0.3, cone, smoothstep(0.15, 0.9, r)) * fall * fall * lit;
}
`;
const FRAG_DECL = 'varying vec2 vLmUv;\nvarying vec3 vWp;\nvarying vec3 vWn;\nuniform sampler2D uLightMap;\nuniform float uUnseen;\nuniform sampler2D uBloodNoise;\nuniform vec3 uCloud;\nuniform vec4 uHouse;\nuniform vec2 uEdge;\nuniform float uAdapt;\nuniform float uNvMono;\nuniform float uNvSat;\nuniform vec4 uFl[6];\nuniform vec4 uFlP[6];\nuniform vec4 uFlK;\nuniform sampler2D uFlSh;\n' + FL_FN;
// blood and soot on everything that stays put (the ground, floors, walls, fences, trees, crates, furniture), read from
// the farm's blood map (effects/blood-map.js): red is blood, green how far up walls and trunks a splash reached, blue
// scorch. Smooth noise in world space breaks its edges up and varies how thick it lies, so it soaks into the ground
// and runs down walls in soft organic stains rather than texels. Things that move (you, zombies, weapons, pickups)
// opt out with userData.mobile, and carry their own stains.
const BMU = { uBloodMap: { value: null }, uBloodNoise: { value: null } };
const WB_DECL = 'uniform sampler2D uBloodMap;\nconst vec2 SOOT = vec2(1.0, 0.17);\n';
const WB_BODY = `
  {
    vec4 bm = texture2D(uBloodMap, vLmUv);
    if (bm.r + bm.b > 0.004 && vLmUv.x > 0.0 && vLmUv.x < 1.0 && vLmUv.y > 0.0 && vLmUv.y < 1.0) {
      float vert = 1.0 - smoothstep(0.45, 0.8, abs(vWn.y)), y = vWp.y;
      vec2 bq = vWp.xz * 0.55 + y * vec2(0.31, 0.17);
      float nz = texture2D(uBloodNoise, bq).r * 0.62 + texture2D(uBloodNoise, bq * 2.7 + 0.37).r * 0.38;
      float reach = 0.3 + bm.g * 2.0;   // how high a splash went: pools stay at the foot of things, sprays go up them
      // lying flat (the ground, a floor, a porch board, a low crate's top): soaked in
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
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.38, 0.04, 0.03) * (0.82 + 0.3 * nz), a * 0.92);   // (no darker pooling where it's thick)
      // soot: soaked into the ground where it lies flat; up a wall only round where the blast struck, SOOT.x up, as tall
      // as SOOT.y at its middle and narrowing to its rim (the map's blue falls off from the middle out, so this rounds it)
      float sk = smoothstep(0.1, 0.5, bm.b * (0.6 + nz * 0.8)), sr = SOOT.y * sqrt(max(0.0, 1.0 - (1.0 - bm.b) * (1.0 - bm.b))) * (0.8 + nz * 0.4);
      float soot = sk * mix(smoothstep(0.6, 0.3, y), smoothstep(sr, sr * 0.55, abs(y - SOOT.x)), vert);
      diffuseColor.rgb *= 1.0 - soot * 0.78;
    }
  }`;
const FRAG_BODY = `
  vec4 lmS = texture2D(uLightMap, vLmUv);
  if (uFlK.w > 0.5) {
    float fl = 0.0;
    for (int i = 0; i < 6; i++) { if (float(i) >= uFlK.w) break; fl += flCone(uFl[i], uFlP[i], vWp.xz, (float(i) + 0.5) / 6.0) * uFlP[i].z; }
    lmS.rgb = min(lmS.rgb + vec3(1.0, 0.95, 0.85) * fl * 0.5, vec3(1.0));
  }
  vec3 lmBase = gl_FragColor.rgb, lmC = lmBase * lmS.rgb * 2.0;
  float lmL = smoothstep(0.16, 0.5, dot(lmS.rgb, vec3(0.299, 0.587, 0.114)) * 2.0);
  float lmV = mix(mix(uUnseen, 0.92, lmL), 1.0, lmS.a);
  lmC *= lmV;
  // eyes used to the dark see a bit more of it, and night vision lifts it more, bringing back some of its colour
  float lmBL = dot(lmBase, vec3(0.299, 0.587, 0.114));
  float lmG = (dot(lmC, vec3(0.299, 0.587, 0.114)) + lmBL * uNvMono * lmV) * (1.0 + uAdapt) + uAdapt * 0.016;
  vec3 lmD = mix(vec3(lmG), min(lmBase * (lmG / max(lmBL, 0.02)), vec3(1.0)), uNvSat);
  gl_FragColor.rgb = mix(lmD, lmC, lmL);   // colour only where there's light: the dark goes black and white
  // clouds passing over: their shade drifts across the farm by day (not indoors)
  if (uCloud.z > 0.001) {
    vec2 cq = vWp.xz * 0.022 + uCloud.xy;
    float cs = texture2D(uBloodNoise, cq).r * 0.65 + texture2D(uBloodNoise, cq * 2.3 + 0.5).r * 0.35;
    float inH = step(uHouse.x, vWp.x) * step(vWp.x, uHouse.z) * step(uHouse.y, vWp.z) * step(vWp.z, uHouse.w);
    gl_FragColor.rgb *= 1.0 - uCloud.z * smoothstep(0.46, 0.72, cs) * (1.0 - inH);
  }`;
// past the edge of the farm everything thins into the haze, so the woods go on into the distance instead of stopping.
// Banks of thicker fog drift through out there too (the same slow drift as the cloud shade), over the woods and the
// road, so the road is never quite clear and what comes in from out there comes out of the fog
const EDGE_BODY = `
  #ifdef USE_FOG
  float edD = max(abs(vWp.x), abs(vWp.z));
  vec2 fgQ = vWp.xz * 0.05 + uCloud.xy * 6.0;
  float fgN = texture2D(uBloodNoise, fgQ).r * 0.6 + texture2D(uBloodNoise, fgQ * 2.1 + 0.37).r * 0.4;
  float haze = smoothstep(uEdge.x, uEdge.y, edD) * 0.9 + smoothstep(uEdge.x, uEdge.x + 5.0, edD) * smoothstep(0.38, 0.72, fgN) * 0.5;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * 0.9, min(haze, 0.94));
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
    Object.assign(sh.uniforms, { uLightMap: LMU.uLightMap, uLmSize: LMU.uLmSize, uLmHalf: LMU.uLmHalf, uUnseen: LMU.uUnseen, uBloodNoise: BMU.uBloodNoise, uCloud: LMU.uCloud, uHouse: LMU.uHouse, uEdge: LMU.uEdge, uAdapt: LMU.uAdapt, uNvMono: LMU.uNvMono, uNvSat: LMU.uNvSat, uFl: LMU.uFl, uFlP: LMU.uFlP, uFlK: LMU.uFlK, uFlSh: LMU.uFlSh });
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
// the wind as the shaders see it (set by stepWind, world/wind.js): [x, z] the way it blows (a unit vector), its strength
// (0 still to 1 a gale) and where its gusts have rolled to (WIND_GUST, the same sum the particles use: gustAt)
const WIND_V = { value: new THREE.Vector4(1, 0, 0.4, 0) };
const WIND_GUST = { k: 0.16, sharp: 6 };
// grass and bushes part round whoever's walking through them: up to four at a time (you, and the zombies nearest you),
// each [x, z, reach, strength], set every frame by updatePushers (world/trees.js)
const PUSHERS = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 0)) };
// instanced foliage bends in the wind; the higher up a vertex sits the more it moves. It leans the way the wind blows,
// further the stronger it is, flutters about that lean (quicker in a strong wind), and bows right over as a gust rolls
// through: a band of it sweeping across the field, plant after plant. With push, it also leans away from anyone
// walking through it (PUSHERS), the tops furthest and pressed down a little, the roots staying put. The bend is worked
// out in the world and turned back into the plant's own frame, so every plant leans the same way whichever way it was
// placed. All in the shader, so it costs nothing on the CPU however much grass there is
function windy(mat, amp, push) {
  const base = mat.onBeforeCompile, baseKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (sh, r) {
    base.call(this || mat, sh, r); sh.uniforms.uWind = WIND; sh.uniforms.uWindV = WIND_V; if (push) sh.uniforms.uPush = PUSHERS;
    sh.vertexShader = 'uniform float uWind;\nuniform vec4 uWindV;\n' + (push ? 'uniform vec4 uPush[4];\n' : '') + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz; float hh = max(0.0, ip.y + transformed.y * 0.9);
  vec2 wd = uWindV.xy, wp = vec2(-wd.y, wd.x);
  float gu = pow(0.5 + 0.5 * sin(dot(ip.xz, wd) * ${WIND_GUST.k.toFixed(3)} - uWindV.w), ${WIND_GUST.sharp.toFixed(1)});
  float ws = uWindV.z * (0.55 + 0.9 * gu);
  float ph = uWind + ip.x * 0.37 + ip.z * 0.23;
  float fl = sin(ph) * 0.7 + sin(ph * 2.3) * 0.3;
  vec2 wOff = (wd * (ws * 1.3 + fl * (0.25 + ws * 0.5)) + wp * cos(ph * 0.8) * (0.15 + ws * 0.3)) * ${amp.toFixed(4)} * hh;
  vec3 pOff = vec3(wOff.x, -ws * ws * ${(amp * 0.25).toFixed(4)} * hh, wOff.y);${push ? `
  vec3 qOff = vec3(0.0);
  for (int q = 0; q < 4; q++) {
    vec4 pu = uPush[q]; vec2 dv = ip.xz - pu.xy; float dd = length(dv);
    float k = pu.w * (1.0 - smoothstep(pu.z * 0.3, pu.z, dd));
    qOff.xz += dv / max(dd, 0.04) * k; qOff.y -= k * 0.4;
  }
  pOff += qOff * hh * ${push.toFixed(3)};` : ''}
  vec3 ic0 = instanceMatrix[0].xyz, ic1 = instanceMatrix[1].xyz, ic2 = instanceMatrix[2].xyz;
  transformed += vec3(dot(ic0, pOff) / dot(ic0, ic0), dot(ic1, pOff) / dot(ic1, ic1), dot(ic2, pOff) / dot(ic2, ic2));
#endif`);
  };
  mat.customProgramCacheKey = function () { return baseKey.call(this || mat) + '-wind2-' + amp + (push ? '-push-' + push : ''); };
  return mat;
}
const basic = c => new THREE.MeshBasicMaterial({ color: c });
const relit = m => lit(m.clone());
