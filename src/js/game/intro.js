// The start of a run: the view glides down from the title shot onto the survivor, who gets up off one knee,
// shakes it off and looks around, while the screen lifts out of the dark and the HUD slides in piece by piece.

const INTRO = { t: -1, cam: 2.1, rise: [0.5, 1.35], look: [1.5, 2.7], fx: 0, fz: 0, z0: 0.5, told: false, stood: false };   // t < 0: not running
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function startIntro() {
  // it starts pulled well back (under the dark veil, so the jump from the title view never shows)
  Object.assign(INTRO, { t: 0, fx: camTarget.x, fz: camTarget.z, told: false, stood: false });
  zoom = INTRO.z0;
  document.body.classList.remove('intro'); void document.body.offsetWidth; document.body.classList.add('intro');
  setTimeout(() => document.body.classList.remove('intro'), 3400);
}
// the clock, run once a frame from updateCamera while playing (so a pause holds it)
function tickIntro(rdt) {
  if (INTRO.t < 0) return;
  INTRO.t += rdt;
  if (!INTRO.told && INTRO.t > 0.95) { INTRO.told = true; announce('Night 1', 'Board up the windows', { eye: 'Kessler Farm' }); }
  if (INTRO.t > INTRO.look[1]) INTRO.t = -1;
}
const introCamOn = () => INTRO.t >= 0 && INTRO.t < INTRO.cam;
// a slight tilt that levels out as the camera arrives
const introRoll = () => introCamOn() ? 0.07 * Math.pow(1 - clamp(INTRO.t / INTRO.cam, 0, 1), 2) : 0;
// gx, gz is where the camera would normally follow to; by the end of the glide the two meet, so it hands over seamlessly
function introCam(gx, gz) {
  const e = easeIO(clamp(INTRO.t / INTRO.cam, 0, 1));
  camTarget.x = INTRO.fx + (gx - INTRO.fx) * e; camTarget.z = INTRO.fz + (gz - INTRO.fz) * e;
  zoom = INTRO.z0 + (zoomT - INTRO.z0) * e;
}
// how far down on one knee you still are (1 kneeling .. 0 standing); walking off hurries you up
function introKneel(spd) {
  if (INTRO.t < 0) return 0;
  const [a, b] = INTRO.rise;
  if (spd > 0.3 && INTRO.t < a) INTRO.t = a + (INTRO.t - a) * 0.3 + 0.0001;
  const k = INTRO.t < a ? 1 : 1 - easeIO(clamp((INTRO.t - a) / (b - a), 0, 1));
  if (!INTRO.stood && k < 0.15) { INTRO.stood = true; groundDust(P.x, P.z, 0.3, 0, 0); SFX.step(0.7, true); }
  return k;
}
// kneeling pose on top of the normal one: hips down, one knee forward, the other leg back, leaning over the front knee
function introPose(pm, up, k) {
  if (k <= 0) return;
  pm.g.position.y -= 0.3 * k;
  pm.legL.rotation.x = pm.legL.rotation.x * (1 - k) - 1.15 * k; pm.legR.rotation.x = pm.legR.rotation.x * (1 - k) + 1.0 * k;
  up.x += 0.42 * k; up.z += 0.05 * k;
  ANIM.sw = Math.max(ANIM.sw, k);   // the weapon hangs low until you're up
}
// once up, a slow look to one side and the other
function introLook(pm) {
  if (INTRO.t < 0) return;
  const [a, b] = INTRO.look, u = (INTRO.t - a) / (b - a);
  if (u > 0 && u < 1) { pm.head.rotation.y += Math.sin(u * Math.PI * 2) * 0.38 * (1 - u); pm.head.rotation.x += Math.sin(u * Math.PI) * 0.06; }
}
