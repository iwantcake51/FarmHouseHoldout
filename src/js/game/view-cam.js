// First person and the free camera: the two ways to see the farm besides the isometric view (game/camera.js). First
// person's picked in the settings (or with the view key: input/keybinds.js), the free camera in the cheat menu.
// First person looks out of your own eyes. The mouse turns your head and your aim, up and down as well as round (the
// pointer's locked to the game while you play), and W A S D walk you forward, back and to either side of where you
// face. The mouse turns the view the moment it moves (eased over a few frames only if the settings ask for it), and
// your eye's pinned to you (EYE_R): carried with you as you walk, at your head's height and its place over your shoulders,
// that eased on a spring so a stride, a lean, a vault moves it smoothly and never jolts it; and it turns with the view
// itself, not with your body coming round after it, so turning never swings it about. Your chest stays on your aim, the
// gun in your hands with it; everything else that moves the view or the gun (a shot's kick, a blow, your stride, a
// sidestep's lean, a landing) is on springs of its own on top. Your own head isn't drawn, so you look out from where
// your eyes are, your arms and the gun in them below.
// The free camera flies anywhere to watch: W A S D along where it looks, Space and Ctrl up and down, Shift faster and
// the wheel its speed. You stay where you were, and every zombie shows wherever it is.
import { KB } from '../input/keybinds.js';
import { CAM_OFF, cv, FP_CAM, GUN_Y, ISO_CAM, R, setCam, V3 } from '../core/renderer.js';
import { angDiff, clamp, rand, rr, smooth } from '../core/math.js';
import { EJECT } from '../weapons/casings.js';
import { thinRay } from '../world/thin-walls.js';
import { bulletBlocked } from '../world/collision.js';
import { P, PM } from '../player/player.js';
import { swapSt, SWAP_T } from '../player/swap.js';
import { curId, SCOPE_ACOG, SCOPES, T, W, W8 } from './run-state.js';
import { MS } from '../melee/melee-anim.js';
import { GM, gunMeshes, HOLDS, MUZ, X } from '../weapons/gun-materials.js';
import { SPRITE_AIM, SPRITE_RES } from '../effects/sprite-batch.js';
import { openSt } from '../stations/station-ui.js';
import { state } from './state.js';
import { keys, lockLost } from '../input/keyboard-mouse.js';
import { aimSX, aimSY, XR } from '../player/shaky-hands.js';
import { zombies } from '../zombies/zombie-types.js';
import { ANIM } from '../player/animation.js';
import { REL_KNOCK } from '../player/hold-kick.js';
import { BACK_LAYER } from '../player/stow.js';
import { vaultGun } from '../player/vaulting.js';
import { cheatOn } from '../ui/cheats.js';
import { SET, setOpen } from '../ui/settings.js';
import { DC } from '../ui/screens.js';
import { camFocus, spectating } from '../net/spectate.js';
import { CEIL, inHouseRect } from '../world/house.js';
import { pvpKiller, pvpPicking } from '../pvp/pvp.js';
import { los } from '../lighting/lightmap.js';

// mode: the view picked; on: the one in use this frame (the isometric one on the menus and when you're down)
export const VCAM = { mode: 'iso', on: 'iso', yaw: Math.PI, pitch: 0, aimY: GUN_Y, aimD: 26 };   // (aimD: how far down your line of sight it meets something, metres: ui/crosshair.js)
export const fpOn = () => VCAM.on === 'fp', freeOn = () => VCAM.on === 'free', isoOn = () => VCAM.on === 'iso';
// how it looks and moves: the eye's place on the head (from its middle: up, forward), the furthest up and down you can
// look, a shot's kick and how it comes home, how far aiming down the sights draws the view in, and the free camera's
// speeds. look: how quickly the view takes up the mouse's movement with the settings' mouse smoothing on (otherwise it's
// taken at once, as any shooter does). side: the eye's a
// little out toward your right, the gun's arm, but not as far as the gun (held X out that side: weapons/gun-materials.js),
// so the gun sits a little right of the middle of the view, as in any shooter (down the sights it comes onto the gun's
// sight line: fpSightAlign)
const FPV = { eye: [0.04, 0.12], side: 0.05, look: 30, adsKick: 0.55, pitch: 1.45, sens: 0.0022, kick: 0.022, kickK: 150, kickD: 15, ads: 0.24, sprint: 0.085 };
// and the view's kick isn't the same each shot (KICK_FEEL): how much harder or softer one goes (vary), the first shot of
// a string harder (first), a roll to one side (roll, radians for a shot of power 1, on its own springier spring: rollK,
// rollD), and a short hard shudder through the view, its tremble dying away fast (shake: radians, its pitch, yaw and
// roll each at its own rate between hz, over t seconds)
const KICK_FEEL = { vary: [0.7, 1.3], first: 1.35, roll: 0.018, rollK: 260, rollD: 14, shake: 0.006, hz: [15, 26], t: 0.16 };
const SHUD = [];
// each shot draws the view in a touch (punch: how hard a shot of power 1 starts it in, about 2.5% at its deepest; a full
// auto's less, auto; never past max all told), on a soft spring (k, d) that lets it back out
const FIRE_FOV = { punch: 0.055, auto: 0.5, max: 0.05, k: 110, d: 15 };
const FREE = { speed: 7, min: 1, max: 40, fast: 3, acc: 7, top: 40 };
// free aim: the gun and your arms move about inside a little circle of the view (r, radians across). Only a share of
// the mouse's movement (take) moves the aim in it, the view turning with the rest and with all of it once the aim's at
// the edge; the aim eases after where it's pushed (ease: how quickly) and the view drifts back onto it (back), so the
// gun comes home to the middle once you stop. Down the sights the circle closes, the view onto the sights (ads). It's
// off (take 0): the view turns exactly as the mouse moves and stops when it stops, nothing drifting on after it
const FA = { r: 0.035, take: 0, ease: 10, back: 1.2, adsBack: 6, ads: 0 };
// bringing the sights up and putting them down: a spring onto them (w: how stiff, in and out; a handgun's quicker),
// starting gently, quick through the middle and settling softly; and the arc the gun swings through on the way, dipping
// (dip, metres) and canting over (cant, radians) in the middle of it, the arms tilting with it, both going up and coming down
const ADS_T = { in: 15, out: 17, side: 19, dip: 0.028, cant: 0.21 };
// a shouldered gun meeting your shoulder as it comes up: a jolt (p, y: radians up and across, r: cant, z: metres back)
// on a loose spring that shakes out (k, d), and the hands trembling a little on the way up (trem); k per gun; draw: how
// much harder the stock seats as a long gun comes up from its draw into the hip hold (fpShoulder)
const SHOULDER_IN = { at: 0.72, p: 0.07, y: 0.05, r: 0.2, z: 0.09, k: 320, d: 10, trem: 0.0035, draw: 3.2, gun: { ar: 1.25, scar: 1.1, lmg: 1.35, sub: 0.9, smg: 0.75 } };
// each shot's kick of the gun in your hands, from your own eyes, worked out shot by shot (V.rc), in three parts:
// the kick: each shot throws the gun on a quick spring that rings a little past home (w: how quick, z: how damped),
// turning it about where it's held: a handgun about your wrists (pivot: down and back from the grip, metres), so its
// muzzle flips up hard and snaps back down, dipping a touch past the aim before it settles; a long gun about your
// shoulder (back at its butt), so it's shoved straight back into you with less flip. How far at its most (radians, and
// metres back and up): flip up, plus per unit of the gun's power (flipPw, backPw); a little roll and twist to one side
// or the other (roll, yaw), and side: a slide sideways. A pump or a bolt gun thumps harder (act). Down the sights a
// good share of each, the gun held tight into you but still kicking (ads: flip, twist, roll; adsMove: its slide back,
// across and up), and your eye doesn't ride it: the gun tips up off your eye's line about your shoulder or your wrists
// and back, so for a moment mid-kick the sights aren't lined up (the rear jumped up at your eye, the post below it),
// with the view taking only some of the kick (FPV.adsKick); the rattle and the climb (adsRattle, adsClimb) your eye
// does go with. The shot goes where the sights point (fpAim): high while the gun's tipped up, and the climb of a held
// trigger is there to pull down
// the way each shot goes (dir): not straight up, but up and off to one side or the other, a bit more often to the
// right as a right-handed shooter's gun goes (bias, radians from straight up, negative right; spread: how far either
// side a shot wanders from that, at most max), the view's kick and the gun's own flip the same way
// the climb (auto): held on the trigger of a full auto, each shot's own kick is a share (k) and the muzzle climbs a
// little more each shot (climb, to at most max, radians), wandering side to side as it goes (wander), eased onto on a
// slower spring (w) and back down once you let go (back, how quickly)
// the rattle: every shot, more on full auto, shakes the gun with a fast buzz through it (pos, metres; rot, radians, at
// the most, at f: its frequencies), the gun chattering in your hands while it fires and dying away quickly after
// (decay); the view itself buzzes a little with it (view)
// how it reads: each shot a quick shove and flip that comes back smoothly, only a hair past home (z: damping well up
// toward critical, so the gun doesn't wobble), a shotgun's (shells) much the heaviest flip (its shove back, shellsBack,
// only a little more, or it's shoved into your face); the rattle a low buzz that drifts
// rather than a noise flickering frame to frame. Down the sights, adsPush of the shove back takes the gun toward your eye
// (your eye riding only adsMove of it), straight back along your line of sight so the front post stays in the middle
const FP_RECOIL = {
  hand: { flip: 0.07, flipPw: 0.13, back: 0.024, backPw: 0.04, up: 0.006, roll: 0.03, yaw: 0.006, side: 0.001, w: 30, z: 0.66, pivot: [0, -0.07, 0.09] },
  long: { flip: 0.03, flipPw: 0.05, back: 0.026, backPw: 0.03, up: 0.004, roll: 0.022, yaw: 0.004, side: 0.0008, w: 24, z: 0.7, pivot: [0, -0.05, 0.36] },
  act: 1.25, boltRet: 0.5, shells: 1.55, shellsBack: 1.05, ads: [0.5, 0.35, 0.4], adsMove: 0.55, adsPush: 0.45, adsRattle: 0.4, adsClimb: 0.6, dir: { bias: -0.05, spread: 0.2, max: 0.35 },
  auto: { k: 0.55, climb: 0.007, max: 0.055, wander: 0.25, w: 9, back: 5 },
  rattle: { pos: 0.0008, rot: 0.003, f: [9, 12, 15], decay: 12, auto: 0.5, semi: 0.22, view: 0.04 }
};
// reloading in first person, the gun's brought up into view where you can watch your hands work it: its action (mid of
// the way along it: the well, the port, the cylinder) eased to
// a place low in the middle of the view (at: across, up, out from your eye, metres; a handgun's: side), turned side on
// (yaw: its muzzle round to the right, so you see its left side and the well and the left hand at it), canted (roll) and its muzzle
// tipped up (pitch), never in close enough to clip your eye
// only part of the way there (k), and hardly turned: the reload as it is at the hip, just brought up enough to see it,
// not presented to you
// (well out and low: the arms are straight blocks from the shoulder, so a hand working the gun any nearer brings its
// arm up across the view, a slab over half the screen at a handgun's slide)
const FP_RELOAD = { at: [-0.005, -0.16, -0.52], side: [-0.01, -0.15, -0.48], roll: -0.1, pitch: 0.1, yaw: -0.3, mid: 0.42, k: 0.45 };
// and while a hand works the action from your own eyes, the gun's let out a little further from them, lower and turned
// (across, up, out from your eye; roll) so the hand works low and to the side of it rather than the arm coming up
// across your eyes: charging a rifle at the end of its reload (turned over onto its left side), racking a handgun's
// slide or dropping it off the stop (slide), a bolt gun's bolt drawn back and run home (bolt; each shot's too) and its
// rounds thumbed in by the firing hand (feed)
const FP_CHARGE = { x: -0.03, y: -0.12, z: -0.2, roll: 0.3 }, FP_SLIDE = { x: 0.01, y: -0.09, z: -0.08, roll: 0 }, FP_BOLT = { x: -0.02, y: -0.08, z: -0.1, roll: 0 }, FP_FEED = { x: -0.01, y: -0.07, z: -0.08, roll: 0 };
// held at the hip in first person, the gun's pushed out a little from your eye (the shorter it is the more, from short
// to long: so a machine pistol isn't tucked in under your chin), along the view
const FP_REACH = { short: 0.13, long: 0.07, len: [0.8, 1.3] };
// and at the hip it's held out to your right and up a little (x, y: across and up the view, metres), as a shooter
// carries it, its muzzle out ahead toward the middle of the view, not down under your chin
const FP_HIP = { x: 0.13, y: 0.06 };
// a gun of its own: the LMG carried a little further over to the right and lower, at the hip on its sling, so its belt
// and the box under the feed tray down out of the middle of the view, but not so far it lies slanted across it
const FP_HIP_GUN = { lmg: { x: 0.155, y: 0.025 } };
const FP_XH_YAW = 1;
const ADS_EYE_MAX = 0.45;   // (the furthest down the sights takes your eye from where your head has it, metres: viewFrame)   // (how much of the crosshair's sideways wander the hip-held gun turns with: fpRecoil)
// the view leaning with how you move: banked into a sidestep (roll), dipped going forward and lifted backing off
// (pitch, and acc for speeding up and slowing), per metre a second, on a spring (k, d); less down the sights
const TILT = { roll: 0.0036, pitch: 0.0024, acc: 0.0006, k: 60, d: 13, ads: 0.6 };
// a melee swing from your own eyes: the view tips the way the weapon's head is travelling across you and dips or lifts
// a touch with it (roll, pitch: radians for each m/s of it, up to max), on a spring (k, d); and a blow that lands knocks
// the view back, a nod up and the eye jolted back off it (hitP, hitZ: how hard, by the blow's weight; kz, dz its spring)
const MELEE_CAM = { roll: 0.012, pitch: 0.005, max: 0.07, k: 70, d: 12, hitP: 0.8, hitZ: 3, kz: 180, dz: 19 };
// a hit: your head flinches from it, snapping back and away from the side it came from and tipping off it, the eye
// jolted back, then it comes straight back to where you were looking (fpFlinch). How hard each way for a usual hit
// (spun up at once, as a velocity: pitch up from a blow in front, down a little from one behind; yaw and roll away
// from its side; back: the eye's jolt), and the spring that brings it home (k, d: stiff, a touch under its damping,
// so it settles with the faintest give past)
const FLINCH = { pitch: 1.2, behind: 0.35, yaw: 0.7, roll: 1.1, back: 0.55, k: 150, d: 17, max: 1.8 };
// free look (held: input/keybinds.js, freeLook): the view turns on its own while the aim and the gun stay where they
// are, as far round as yaw and pitch (radians), easing back onto the aim (back) once it's let go or the sights come up
const FREE_LOOK = { yaw: 1.9, pitch: 1.1, ease: 16, back: 9 };
// the view's bob with your stride (P.phase: a footfall every half turn): dipping (up, metres) and nodding (pitch) as
// each foot lands, swaying across (side, metres) and rocking (roll) a step each way; at full walking pace (speed, metres
// a second), more running, much less down the sights (ads), eased in and out as you start and stop (ease)
const BOB = { up: 0.003, pitch: 0.0026, side: 0.0032, roll: 0.003, speed: 4.2, max: 1.0, ads: 0.75, ease: 4, foot: 0 };   // (max: a sprint bobs no harder than a walk)   // (foot: how much the dip lands sharp on each footfall rather than a plain wave: none, a smooth dip and rise each step the way your eyes and neck smooth out a stride, small, as the head really moves a centimetre or two and the eyes cancel most of it)
// coming down off a vault, the view and the gun dip on landing and come back up on a spring (metres a second of the drop)
const LAND = { cam: 0.42, k: 110, d: 13 };
// a vault from your own eyes: crouching to it, a glance down at the sill or rail your hands go on (look, radians), the
// view pitching with the body's lean as it goes over (lean: how much of it) and tipping toward the side the legs swing
// to (roll), let go of again by the time you're down (out: how far through); a touch wider a view in the air (fov).
// The landing: the knees take it, the view dropping (drop, metres a second, on LAND's spring) and nodding down (nod,
// radians a second) and rolling a touch (rock), on a looser spring (k, d) that rocks back up past level and settles; a
// tired scramble lands harder (heavy). With Vault fire the glance and the lean are mostly kept off (fire), the aim held
// Wide eyes from your own eyes (upgrades/tier-table.js): the view that much wider, by how far up the line you are; and
// what's close by off the edges of the screen sensed (ui/sense.js)
const WIDE_FOV = [0, 0.1, 0.14];
const FP_VAULT = { look: 0.34, lean: 0.36, roll: 0.075, out: [0.55, 0.95], fov: 0.06, drop: 0.95, nod: 2.6, rock: 0.5, k: 95, d: 12, heavy: 1.45, fire: 0.3, ease: 14 };
// the gun and your arms from your own eyes, on top of the hold (player/hold.js: fpViewSway), on soft springs (k, d) so
// it all eases: tilted into a sidestep (roll, radians per metre a second) and trailing behind it (lag, metres), dipped
// and drawn in a touch going forward (fwd), rolled into a turn (turn), bobbing in a figure of eight with your stride
// (bob: across, down, roll), breathing when you stand still (breathe: up, pitch), dipping as you land (land); much less
// of it down the sights (ads)
// at a sprint, how much more the turn swings them (k), and how far they trail it round (yaw, radians for each radian a
// second of turn; never past max) and out to the side (side, metres)
const VM_RUN = { k: 2.6, yaw: 0.012, max: 0.09, side: 0.0016 };
// looking round, the gun and your arms trail the view on those springs, whichever way it goes (round, up, down, or
// both at once, so a diagonal flick sways them diagonally): left behind across the view (x, metres) and turned back
// against it (yaw), dropped below it or left above it (y, metres; pitch, radians), each for each radian a second of
// turn and never past max (radians a second of it counted); rolled the other way to a turn (VM.turn)
const VM_LOOK = { x: 0.0032, yaw: 0.0085, y: 0.0026, pitch: 0.007, max: 6 };
// down the sights the gun isn't nailed to the middle of the view either: it sways a little off it (ADS_SWAY, radians),
// side to side and dipping with each step (bob: yaw, pitch), trailing a turn or a look up or down (look, of the turn's
// speed, as far as max) and rising and falling with your breath when you stand still (breathe), on a spring (k, d). The
// view stays where you look; the sights drift about it and come back, and the shots go where they point. On top, the
// gun's held sway (player/shaky-hands.js: XR.hx, hy): idle radians across and up for each share of a long gun's held
// still, so a heavy gun, weight out front, being winded or hurt has the sights and the scope's picture wander more
const ADS_SWAY = { bob: [0.011, 0.008], look: 0.005, max: 0.03, breathe: 0.0015, idle: [0.0016, 0.0013], k: 60, d: 11 };
// and at the hip the gun wanders with it too, in its own frame: hold, yaw and pitch (radians) and across and up
// (metres) for each share
const VM_HOLD = { yaw: 0.0028, pitch: 0.0022, x: 0.0005, y: 0.0004 };
// (bob: the arms' and gun's own sway with each stride, across, up and down and rolled; bobRot: and turned with it, a yaw
// swung side to side with the step and a nod down onto each footfall, each a beat behind the step (lag, radians of the
// stride) as the arms carry it, so the gun rides the walk in a loose figure of eight rather than bouncing up and down)
const VM_BOB_ROT = { yaw: 0.013, pitch: 0.014, lag: 0.55 };
const VM = { roll: 0.022, lag: 0.0035, fwd: 0.0022, turn: 0.011, bob: [0.0036, 0.0021, 0.014], breathe: [0.0014, 0.0035], land: 0.55, k: 75, d: 12.5, ads: 0.88 };
const VS = { x: 0, y: 0, z: 0, p: 0, w: 0, r: 0, vx: 0, vy: 0, vz: 0, vp: 0, vw: 0, vr: 0 };
// down the sights without a set eye relief (a red dot, a holo, a handgun's irons), the nearest your eye comes to the back
// of the sights, so the gun's never pushed into your face (aiming up, say): an optic's, iron sights'
// (a handgun's irons, hand: the eye a little further back off the slide, which carries the rear sight and slams back
// 7 cm at it with each shot, filling the view at iron's distance; much further and your own forearms rise into view)
const EYE_MIN = { optic: 0.15, iron: 0.25, hand: 0.32 };
// down a handgun's red dot or holo: the eye brought in to relief behind the back of it rather than left at arm's length
// (where its little window was a sliver of the view), and the view drawn in by zoom more than down other sights
const HAND_OPTIC = { relief: 0.13, zoom: 0.15 };
// down the sights, particles thinned toward the aim: out to r of the view's height, by k at most
const AIM_THIN = { r: 0.16, k: 1 }, _vcS = new THREE.Vector2();
// the third-person camera's jolts as first person feels them (game/camera.js): a push along the aim dips the view
// (push, radians a unit), one across turns it, a zoom draws the view in (zoom); all eased (ease) so they roll rather
// than snap. A reload's own sway (relP: down onto the gun, relR: rocking with the hands) and the shake (shake: radians)
// as a smooth wobble rather than a jitter
const FP_JOLT = { push: 0.5, zoom: 0.4, ease: 18, relP: 0.035, relR: 0.012, shake: 0.03 };
// where the view and the free camera are, and its springs (kick: the pitch; ky: the yaw)
// your eye pinned to you: its place over your shoulders as your body has it (on your chest, where your head sits on it),
// eased on a critically damped spring (w: how quickly, a second's worth; vault: over a vault and just after, when it
// moves a long way quickly), so the stride's own rise and fall and the body's sway hardly reach it while a lean, a
// vault, a step up are followed smoothly; and the gun's pitch to the view's (pitch: of how far you look up or down, for
// the arms and the upper body bending together: player/hold.js, ANIM.pitch)
const EYE_RIG = { w: 9, vault: 22, pitch: 0.79 }, EYE_PIN = { k: 1, ease: 8 };
const EYE_R = { o: new V3(), v: new V3(), on: false, ref: new V3(), t0: new V3(), tv: new V3(), ff: 0 };
const V = { mdx: 0, mdy: 0, cy: Math.PI, cp: 0, fax: 0, fay: 0, ftx: 0, fty: 0, ay: null, ap: null, adsX: null, adsV: 0, sh: { p: 0, vp: 0, y: 0, vy: 0, r: 0, vr: 0, z: 0, vz: 0, up: false, k: 1 }, rc: { p: 0, vp: 0, y: 0, vy: 0, r: 0, vr: 0, z: 0, vz: 0, x: 0, vx: 0, h: 0, vh: 0, w: 30, d: 24, cp: 0, vcp: 0, cy: 0, vcy: 0, tp: 0, ty: 0, t: 0, last: -9, e: 0, ph: [0, 0, 0, 0, 0, 0], kind: 'long' }, tr: 0, vtr: 0, tp: 0, vtp: 0, lvx: 0, lvz: 0, bobK: 0, bp: 0, br: 0, bx: 0, by: 0, fly: 0, flp: 0, flyT: 0, flpT: 0, jp: 0, jy: 0, jz: 0, np: 0, ny: 0, rollS: 0, x: P.x, y: 1.4, z: P.z, fx: 0, fy: 6, fz: 0, fyaw: 0, fpitch: -0.6, vx: 0, vy: 0, vz: 0, speed: FREE.speed, kick: 0, vk: 0, ky: 0, vky: 0, eye: null, roll: 0, sw: 0, lyaw: null, lpitch: null, land: 0, vland: 0, vaulted: false, lcy: null, vp: 0, vr: 0, vfov: 0, lp: 0, vlp: 0, lr: 0, vlr: 0 };
// Your arms and the gun from your own eyes are carried by the view, as a game's arms are: the upper body (your arms,
// what's in your hands, and the chest they hang off) is put each frame where it would be with your eye at the view's eye
// and stood straight up under it, so the chest's own stride, its lean into a walk and its roll into a sidestep, and the
// eye's spring easing after it, never shift the arms and the gun against the view, which would leave them trailing it
// and jogging about a beat behind as you move. Only their own sway (VM) moves them on top of it. Its turn is kept as
// it's posed (the arms already turn with the view). k: how much (eased off through a vault, the hands on the sill)
const _vlC = new V3(), _vlM = new THREE.Matrix4(), _vlM2 = new THREE.Matrix4(), _vlQ = new THREE.Quaternion(), _vlQ2 = new THREE.Quaternion(), _vlE = new THREE.Euler(), _vlS = new V3(), _vlI = new THREE.Quaternion();
function vmLock(eye, k) {
  if (k < 0.001) return;
  const up = PM.upper; PM.g.updateMatrixWorld(true);
  chestEye(_vlC);   // (where the posed chest has your eye)
  up.getWorldQuaternion(_vlQ); _vlE.setFromQuaternion(_vlQ, 'YXZ'); _vlQ2.setFromEuler(_vlE.set(0, _vlE.y, 0, 'YXZ'));   // stood straight, turned as it is
  _vlQ2.multiply(_vlQ.invert()); if (k < 1) _vlQ2.slerp(_vlI, 1 - k);
  _vlS.subVectors(eye, _vlC).multiplyScalar(k).add(_vlC);
  // (stood straight about the waist, not about the eye, and the way across to the eye taken by the whole of you, legs
  // too: moved about the eye, the chest came off the hips, a melee weapon's lean into its guard taking it well clear
  // of them; up and down it's the upper body's alone, the feet staying on the ground. Where the upper body ends up is
  // the same either way: lockInv)
  up.getWorldPosition(_vlW);
  _vlM.makeTranslation(-_vlW.x, -_vlW.y, -_vlW.z).premultiply(_vlM2.makeRotationFromQuaternion(_vlQ2)).premultiply(_vlM2.makeTranslation(_vlW.x, _vlW.y, _vlW.z));
  _vlC.applyMatrix4(_vlM); _vlS.sub(_vlC);   // (how far it's still to go, once stood straight)
  _vlM.premultiply(_vlM2.makeTranslation(0, _vlS.y, 0)).multiply(up.matrixWorld);
  PM.g.position.x += _vlS.x; PM.g.position.z += _vlS.z; PM.g.updateMatrixWorld(true);
  _vlM.premultiply(_vlM2.makeTranslation(_vlS.x, 0, _vlS.z)).premultiply(_vlM2.copy(up.parent.matrixWorld).invert());
  _vlM.decompose(up.position, up.quaternion, up.scale); up.updateMatrixWorld(true);
}
const _vlW = new V3();
// and the look up or down: the arms and gun are held level from your own eyes (player/hold.js: FP_PIV) and the whole
// upper body, arms, hands and gun together, turned with the view about your eye, so they sit in the view where they do
// looking straight ahead, however far you look up or down, as a game's arms do, and your chest and shoulders stay
// below the view rather than filling it as you look down (pointed about the shoulder instead, the gun rode up the view
// as you looked down and the arms tipped past it)
const _fcA = new THREE.Matrix4(), _fcM = new THREE.Matrix4(), _fcE = new V3(), _fcQ = new THREE.Quaternion(), _fcR = new THREE.Euler();
// (that move, in the upper body's own frame as it is once locked, Wl: the view's turn about your eye, about the view's
// own level axis across it)
function carryMat(out, Wl, k) {
  _fcE.set(FPV.side, FPV.eye[0], FPV.eye[1]).add(PM.head.position).applyMatrix4(Wl);
  _fcQ.setFromEuler(_fcR.set(0, VCAM.yaw, 0)); out.makeRotationFromQuaternion(_fcQ).multiply(_fcM.makeRotationX(-VCAM.pitch * k)).multiply(_fcM.makeRotationFromQuaternion(_fcQ.invert()));
  out.premultiply(_fcM.makeTranslation(_fcE.x, _fcE.y, _fcE.z)).multiply(_fcM.makeTranslation(-_fcE.x, -_fcE.y, -_fcE.z));
  return out.premultiply(_fcM.copy(Wl).invert()).multiply(Wl);
}
function fpCarry(k) {
  if (k < 0.001) return;
  const up = PM.upper; up.updateMatrix(); up.updateMatrixWorld(true);
  carryMat(_fcA, up.matrixWorld, k).premultiply(up.matrix).decompose(up.position, up.quaternion, up.scale); up.updateMatrixWorld(true);
}
V.sd = new V3(0, 0, 1); V.sdW = 0;
const _vcE = new V3(), _vcD = new V3(), _vcZ = new V3();

// the view in use: what's picked, but the isometric one on the menus, as you go down and once you're down
// (picking cards between waves too, and as they go: upgrades/upgrade-screen.js)
// (going down from your own eyes, the view's kept and drawn back out of them over your body (fpDeathCam) rather than cut
// to the one from above: until you're watching a teammate, in co-op)
// (watching a teammate with the first-person view picked, it's from their eyes while they're looking from them, and
// from above while they're looking from above: what they see, either way (specFpOn; net/avatars.js: specFp))
export const specFpOn = () => P.dead && VCAM.mode === 'fp' && !!DC.spec && (state === 'play' || state === 'paused') && spectating() && !!camFocus().fv;
// (and a run abandoned from your own eyes, the same: the view's drawn back out of them over you as the run ends,
// QUIT_CAM, rather than cut to the one from above)
const QUIT_CAM = { on: false };
export function quitPull() { QUIT_CAM.on = VCAM.mode === 'fp'; }
const wantOn = () => (state === 'play' || state === 'paused' || state === 'upgrade' || state === 'leaving') && !P.dead ? VCAM.mode
  : specFpOn() ? 'fp'
  : QUIT_CAM.on && VCAM.mode === 'fp' && state === 'dead' ? 'fp'
  : P.dead && VCAM.mode === 'fp' && (state === 'play' || state === 'paused' || state === 'dead') && !DC.spec ? 'fp' : 'iso';
export function setViewMode(m) {
  m = m === 'fp' || m === 'free' ? m : 'iso';
  if (m === VCAM.mode) return;
  if (m === 'free') {
    // the free camera starts where the view is: the isometric camera's spot (a little in toward you), or your eyes
    const c = VCAM.on === 'fp' ? FP_CAM.position : null;
    if (c) freeTo(c.x, c.y, c.z, VCAM.yaw, VCAM.pitch);
    else { const o = CAM_OFF.clone().normalize().multiplyScalar(14); freeTo(P.x + o.x, o.y, P.z + o.z, Math.atan2(-o.x, -o.z), -Math.asin(o.y / 14)); }
  }
  if (m === 'fp' && VCAM.mode !== 'fp') { VCAM.yaw = P.aim; VCAM.pitch = -0.12; EYE_R.on = false; }   // looking where you were aiming, a touch down
  VCAM.mode = m;
  syncView();
}
// the camera that's drawn with, and what's hidden for it, kept to the view in use
export function syncView() {
  const on = wantOn();
  if (on !== VCAM.on) {
    if (on === 'fp' && VCAM.on === 'iso') { VCAM.yaw = P.aim; EYE_R.on = false; }
    VCAM.on = on; setCam(on === 'iso' ? ISO_CAM : FP_CAM);
    document.body.classList.toggle('fpView', on === 'fp'); document.body.classList.toggle('freeView', on === 'free');
    if (on === 'iso') unlock();
  }
  PM.head.visible = on !== 'fp' || specFpOn();   // (down, it's shown again once the view's drawn back out of it: fpDeathCam)   // (out of your own eyes: your head, its hair and hat, would be all round the lens)
}

// ---- the mouse: locked to the game while you look about, and let go for a menu
export const locked = () => document.pointerLockElement === cv;
let selfUnlock = false;
// (lockAt: when it was last asked for, so a menu closing as it's asked for, the pause going, doesn't let it straight go)
// (ahead: taken now, for the first-person run being started by this click (ui/screens.js: enterRun), the view still
// the title's above: browsers only hand the mouse over in answer to a click or a key, so it's taken with the click on
// Start rather than asking for another once you're in)
// (LOCK.wait: one ask at a time, the same click often asking twice, the menu's own handler and then the game's, and a
// browser can drop the lock it was just granting for the second; LOCK.grace: the mouse lost that soon after it was asked
// for is that, not you letting go of it, so it doesn't pause the game: lockLost)
const LOCK = { wait: 1000, grace: 900 };
export function wantLock(ahead) {
  if ((ahead ? VCAM.mode === 'iso' : isoOn()) || locked() || !cv.requestPointerLock) return;
  if (V.lockPend && performance.now() - V.lockPend < LOCK.wait) return;
  V.lockAt = V.lockPend = performance.now();
  // (the mouse's raw movement where the browser has it, no pointer acceleration in the way: the view turns by just as
  // much as the mouse moves, however fast; plain where it hasn't)
  const plain = () => { try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => { V.lockPend = 0; }); } catch (e) { V.lockPend = 0; } };
  try { const p = cv.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(e => { if (e && e.name === 'NotSupportedError') plain(); else V.lockPend = 0; }); } catch (e) { plain(); }
}
function unlock() { if (locked()) { selfUnlock = true; document.exitPointerLock(); } }
// the mouse moved this much (pixels) while it's locked: the view turns, slower down the sights and slower again through
// a scope (the settings' sensitivity on top)
export function viewLook(dx, dy) {
  const s = FPV.sens * (SET.sens || 100) / 100 * (1 - 0.35 * (ANIM.ads || 0)) / (SCOPE_V.on && SCOPE_V.mag > 1 && (SCOPE_V.kind === 'scope' || SCOPE_V.kind === 'acog') ? 1 + (SCOPE_V.mag - 1) * 0.6 * SCOPE_V.w : 1);   // (slower through a scope, as it magnifies)
  if (freeOn()) { V.fyaw -= dx * s; V.fpitch = clamp(V.fpitch - dy * s, -FPV.pitch, FPV.pitch); return; }
  if (state !== 'play' || openSt || cheatOn || setOpen()) return;   // (no looking round till a menu's quite gone: the cards still going as they're taken, a station's)
  fpAimSync();
  if (fpOn() && !freeLooking() && SET.smooth === 'on') { V.mdx += dx * s; V.mdy += dy * s; return; }   // (taken up smoothly, frame by frame: fpLookStep)
  lookBy(dx * s, dy * s);
}
// the mouse's movement taken up by the view, eased: what's still to come goes in a share each frame
// (taken up at the start of the frame, before the body's posed from the aim (game/loop.js): taken up with the view, after
// it, the arms were posed to the aim before this frame's turn and trailed the view by it, the faster you turned the further)
export function fpLookStep(rdt) {
  if (!fpOn()) return;
  const k = 1 - Math.exp(-rdt * FPV.look), ax = V.mdx * k, ay = V.mdy * k; V.mdx -= ax; V.mdy -= ay;
  if (Math.abs(ax) + Math.abs(ay) > 1e-7) lookBy(ax, ay);
}
// the view and the aim turned by (dx, dy) radians' worth of the mouse
function lookBy(dx, dy) {
  const ex = -dx, ey = -dy;
  if (freeLooking()) { V.flyT = clamp(V.flyT + ex, -FREE_LOOK.yaw, FREE_LOOK.yaw); V.flpT = clamp(V.flpT + ey, -FREE_LOOK.pitch, FREE_LOOK.pitch); return; }
  V.cy += ex * (1 - FA.take); V.cp += ey * (1 - FA.take); V.ftx += ex * FA.take; V.fty += ey * FA.take;
  fpFreeAim(0);
}
// the view's own way this frame on top of where it's turned (kick: a shot's, which the aim takes too; tilt, free look,
// jolts, shake: the view's alone), and its roll
const viewP = () => V.cp + V.kick + V.tp + V.flp + V.jp + V.np + V.bp + V.vp + V.lp + (V.mp || 0) + (V.mk || 0) + FL.p + (V.shp || 0), viewY = () => V.cy + V.ky + V.fly + V.jy + V.ny + FL.y + (V.shy || 0), viewR = () => V.roll * 0.6 + V.tr + V.br + V.vr + V.lr + (V.mr || 0) + FL.r + (V.kr || 0) + (V.shr || 0);
// and the same without the free look (held: the view turns on its own), for what's placed on the gun in your hands, which
// stays on the aim as you look round (FREE_LOOK)
const armsP = () => viewP() - V.flp, armsY = () => viewY() - V.fly;
const freeLooking = () => fpOn() && keys.has(KB.freeLook) && adsW() < 0.3;
// the aim set from elsewhere (going into first person, a test): the view onto it, nothing off the middle
function fpAimSync() {
  if (V.ay === VCAM.yaw && V.ap === VCAM.pitch) return;
  V.cy = VCAM.yaw; V.cp = VCAM.pitch; V.fax = V.fay = V.ftx = V.fty = 0; V.ay = VCAM.yaw; V.ap = VCAM.pitch;
}
// the aim's place in the circle (as it closes down the sights): pushed past its edge the view takes the rest; the aim
// easing after where it's pushed; the view drifting back onto it. The aim's the view's way and its offset
function fpFreeAim(dt) {
  fpAimSync();
  const w = adsW(), r = FA.r * (1 - w) + FA.ads * w;
  // (the view moving onto the aim by d leaves the aim where it is)
  const toView = (dx, dy) => { V.cy += dx; V.cp += dy; V.ftx -= dx; V.fty -= dy; V.fax -= dx; V.fay -= dy; };
  if (dt > 0) { const k = 1 - Math.exp(-dt * (FA.back + (FA.adsBack - FA.back) * w)); toView(V.ftx * k, V.fty * k); }
  const L = Math.hypot(V.ftx, V.fty); if (L > r) toView(V.ftx * (1 - r / L), V.fty * (1 - r / L));
  if (dt > 0) { const k = 1 - Math.exp(-dt * FA.ease); V.fax += (V.ftx - V.fax) * k; V.fay += (V.fty - V.fay) * k; }
  const La = Math.hypot(V.fax, V.fay); if (La > r * 1.15) { V.fax *= r * 1.15 / La; V.fay *= r * 1.15 / La; }
  V.cp = clamp(V.cp, -FPV.pitch, FPV.pitch);
  VCAM.yaw = V.cy + V.fax; VCAM.pitch = clamp(V.cp + V.fay, -FPV.pitch, FPV.pitch); V.ay = VCAM.yaw; V.ap = VCAM.pitch;
}
// where the aim is on the screen, from its middle (pixels): where the crosshair sits and the arms point the gun
// (player/movement.js puts the pointer there)
const _faQ = new THREE.Quaternion(), _faE = new THREE.Euler(), _faV = new V3();
export function fpAimPx(arms = false) {
  if (!fpOn()) return [0, 0];
  _faV.set(0, 0, -1).applyEuler(_faE.set(VCAM.pitch, VCAM.yaw + Math.PI, 0, 'YXZ')).applyQuaternion(_faQ.setFromEuler(_faE.set((arms ? armsP() : viewP()) - V.kick, (arms ? armsY() : viewY()) - V.ky + Math.PI, viewR(), 'YXZ')).invert());
  const f = innerHeight / 2 / Math.tan(FP_CAM.fov * Math.PI / 360), z = Math.max(0.2, -_faV.z);
  return [_faV.x / z * f, -_faV.y / z * f];
}
// first person's sights coming up and going down, on a spring (ADS_T) (game/camera.js: ANIM.ads); and a shouldered gun
// meeting your shoulder on the way up (SHOULDER_IN)
export function fpAds(want, rdt) {
  if (want === null) { V.adsX = null; V.adsV = 0; return 0; }
  const id = curId(), D = W(id), side = !D || D.slot === 'side', w0 = side ? ADS_T.side : want ? ADS_T.in : ADS_T.out, S = V.sh;
  if (V.adsX === null) V.adsX = ANIM.ads || 0;
  const x0 = V.adsX;
  for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
    V.adsV += (w0 * w0 * ((want ? 1 : 0) - V.adsX) - 2 * w0 * V.adsV) * h; V.adsX += V.adsV * h;
    S.vp += (-SHOULDER_IN.k * S.p - SHOULDER_IN.d * S.vp) * h; S.p += S.vp * h; S.vy += (-SHOULDER_IN.k * S.y - SHOULDER_IN.d * S.vy) * h; S.y += S.vy * h;
    S.vr += (-SHOULDER_IN.k * S.r - SHOULDER_IN.d * S.vr) * h; S.r += S.vr * h; S.vz += (-SHOULDER_IN.k * S.z - SHOULDER_IN.d * S.vz) * h; S.z += S.vz * h;
  }
  V.adsX = clamp(V.adsX, -0.02, 1.02);
  if (V.adsX < 0.3) S.up = false;
  if (want && !side && !S.up && x0 < SHOULDER_IN.at && V.adsX >= SHOULDER_IN.at) {
    S.up = true; const k = SHOULDER_IN.gun[id] ?? 1; S.k = k;
    S.vp += SHOULDER_IN.p * k * rr(0.8, 1.2); S.vy += SHOULDER_IN.y * k * rr(-1, 1); S.vr += SHOULDER_IN.r * k * rr(0.6, 1) * (Math.random() < 0.5 ? -1 : 1); S.vz += SHOULDER_IN.z * k * rr(0.8, 1.2);
  }
  return clamp(V.adsX, 0, 1);
}
// a long gun's stock meeting your shoulder from the hip (the end of its draw, player/swap.js): the same seat of it into
// the shoulder as raising the sights gives (SHOULDER_IN), k as hard (a heavy gun the more), there at the hip too
// (fpRecoil) and carried on down the sights if you raise them while it's still settling
export function fpShoulder(k) {
  if (!fpOn()) return; const D = W(curId()); if (!D || D.slot === 'side' || D.melee) return;
  const S = V.sh, g = (SHOULDER_IN.gun[curId()] ?? 1) * SHOULDER_IN.draw * k;   // (draw: from the hip it's a bigger seat than the last of the way up to the sights)
  S.vp += SHOULDER_IN.p * g * rr(0.8, 1.1); S.vy += SHOULDER_IN.y * 0.6 * g * rr(-1, 1); S.vr += SHOULDER_IN.r * 0.6 * g * rr(0.6, 1) * (Math.random() < 0.5 ? -1 : 1); S.vz += SHOULDER_IN.z * g * rr(0.8, 1.1);
}
// the shouldering's shake this frame, and the hands' tremble as it comes up: [up, across, cant, back]
const _shk = [0, 0, 0, 0, 0, 0];
function shoulderShake() {
  const S = V.sh, C = V.rc, D = W(curId()), A = FP_RECOIL.ads, R = FP_RECOIL.rattle, rn = rattleAt();
  // (down the sights: the climb of a held trigger, the rattle, and each shot's shove back, across and up, which your
  // eye goes with, your cheek on the stock; each shot's turn of it isn't here: the gun's tipped off your eye's line by
  // that after your eye's placed, adsKickTilt)
  const F = FP_RECOIL, q = F.adsRattle, m = F.adsMove, cl = F.adsClimb;
  _shk[0] = (C.cp * cl + rn[3] * q) * A[0]; _shk[1] = (C.cy * cl + rn[4] * q) * A[1]; _shk[2] = rn[5] * q * A[2]; _shk[3] = (C.z + rn[2] * q) * m; _shk[4] = (C.x + rn[0] * q) * m; _shk[5] = (C.h + rn[1] * q) * m;
  if (!(fpOn() && D && D.slot !== 'side')) return _shk;
  const t = performance.now() / 1000, x = clamp(V.adsX ?? 0, 0, 1), tr = SHOULDER_IN.trem * (SHOULDER_IN.gun[curId()] ?? 1) * Math.sin(Math.PI * x) * (V.adsV > 0 ? 1 : 0.4);
  _shk[0] += S.p + tr * (Math.sin(t * 23.1) + 0.6 * Math.sin(t * 37.7 + 1.3)); _shk[1] += S.y + tr * (Math.sin(t * 19.3 + 2.1) + 0.6 * Math.sin(t * 41.9));
  _shk[2] += S.r; _shk[3] += S.z;
  return _shk;
}
// reloading: the gun up into view (FP_RELOAD), by k (how far into the reload it is, eased: player/hold.js), less as the
// sights come up; from the hold (player/hold.js), after fpRecoil and before your hands go on it
const _rlC = new V3(), _rlD = new V3(), _rlM = new THREE.Matrix4(), _rlQ = new THREE.Quaternion(), _rlE = new V3(), _rlS = new V3(1, 1, 1);
// the view this frame, before the camera's placed (at the eye, turned as the view is): what the gun's placed by from the hold
// (the eye where the view will be this frame, pinned as viewFrame pins it: EYE_PIN; and the whole of it taken back
// through the move vmLock is about to make of the upper body, lockInv: what's placed against the view now, on the
// body as it's posed, lands on the view once the body's put onto it, and isn't thrown off by however the body's
// turned under the view, which jolted the gun a few millimetres each time a turn started or stopped and shook it as
// you turned)
function viewMat(out) {
  rigEye(_rlE); { const o = EYE_R.o, y = VCAM.yaw, k = (V.pin ?? 1) * EYE_PIN.k; if (EYE_R.on) { _rlE.x -= (o.x * Math.cos(y) + o.z * Math.sin(y)) * k; _rlE.z -= (-o.x * Math.sin(y) + o.z * Math.cos(y)) * k; } }
  _rlQ.setFromEuler(_rE.set(armsP(), armsY() + Math.PI, viewR(), 'YXZ')); out.compose(_rlE, _rlQ, _rlS);
  if (fpOn()) { out.premultiply(lockInv(_liM)); out.decompose(_rlE, _rlQ, _rlS2); }
  return out;
}
// sprinting from your own eyes, the gun held low across you (player/hold.js: FP_SPRINT) is kept out of your face, whatever
// its shape: the top of its back end (a long wooden stock, a buffer tube, a pistol's grip) never comes up past
// SPRINT_CLEAR.ndc of the way down the view, nor nearer your eye than SPRINT_CLEAR.near; where it would, the whole gun
// is let down (and eased out) by as much, by rd, how far into the sprint pose it is. Its shape's measured once
// (gg.userData.bb: its rear third's top corners, in its own frame)
const SPRINT_CLEAR = { ndc: -0.72, near: 0.3 }, _spcM = new THREE.Matrix4(), _spcP = new V3(), _spcB = new THREE.Box3(), _spcX = new V3(), _spcU = new V3(), _spcF = new V3();
function gunBack(gg) {
  if (gg.userData.bb) return gg.userData.bb;
  gg.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(gg.matrixWorld).invert(), b = new THREE.Box3(), v = new V3();
  gg.traverse(o => { if (!o.isMesh || !o.geometry || o.userData.outline) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); _spcB.copy(g.boundingBox).applyMatrix4(_spcM.multiplyMatrices(inv, o.matrixWorld)); b.union(_spcB); });
  if (b.isEmpty()) return (gg.userData.bb = []);
  const z0 = b.min.z, z1 = b.min.z + (b.max.z - b.min.z) / 3;
  return (gg.userData.bb = [[b.min.x, b.max.y, z0], [b.max.x, b.max.y, z0], [b.min.x, b.max.y, z1], [b.max.x, b.max.y, z1], [(b.min.x + b.max.x) / 2, b.max.y, (z0 + z1) / 2]].map(a => v.clone().fromArray(a)));
}
export function fpSprintClear(gg, rd) {
  if (!fpOn() || !gg.parent || rd < 0.001) return;
  const pts = gunBack(gg); if (!pts.length) return;
  viewMat(_rlM); _spcM.copy(_rlM).invert(); gg.updateMatrixWorld(true);
  const t = Math.tan(FP_CAM.fov * Math.PI / 360) * -SPRINT_CLEAR.ndc; let down = 0, out = 0;
  for (const p of pts) {
    _spcP.copy(p).applyMatrix4(gg.matrixWorld).applyMatrix4(_spcM);   // (in the view's own frame: -z ahead, y up)
    const d = Math.max(0.05, -_spcP.z); down = Math.max(down, _spcP.y + t * d); out = Math.max(out, SPRINT_CLEAR.near - (-_spcP.z));
  }
  if (down <= 0 && out <= 0) return;
  _rlM.extractBasis(_spcX, _spcU, _spcF);   // (the view's across, up and back)
  _spcP.setFromMatrixPosition(gg.matrixWorld).addScaledVector(_spcU, -Math.max(0, down) * rd).addScaledVector(_spcF, -Math.max(0, out) * rd);
  gg.position.copy(gg.parent.worldToLocal(_spcP)); gg.updateMatrix(); gg.updateMatrixWorld(true);
}
// vmLock's move of the upper body as it'll be made this frame, and fpCarry's after it, undone (see vmLock: from where
// the posed chest has your eye onto the eye, stood straight)
const _liM = new THREE.Matrix4(), _liM2 = new THREE.Matrix4(), _liM3 = new THREE.Matrix4(), _liC = new V3(), _liS = new V3(), _liQ = new THREE.Quaternion(), _liQ2 = new THREE.Quaternion(), _liE = new THREE.Euler(), _rlS2 = new V3();
function lockInv(out) {
  const k = V.vlk ?? 1, up = PM.upper;
  if (k < 0.001) return out.identity();
  chestEye(_liC); up.getWorldQuaternion(_liQ); _liE.setFromQuaternion(_liQ, 'YXZ'); _liQ2.setFromEuler(_liE.set(0, _liE.y, 0, 'YXZ'));
  _liQ2.multiply(_liQ.invert()); if (k < 1) _liQ2.slerp(_vlI, 1 - k);
  _liS.subVectors(_rlE, _liC).multiplyScalar(k).add(_liC);
  out.makeTranslation(-_liC.x, -_liC.y, -_liC.z).premultiply(_liM2.makeRotationFromQuaternion(_liQ2)).premultiply(_liM2.makeTranslation(_liS.x, _liS.y, _liS.z));
  // (and fpCarry's after it, undone too: in the upper body's frame once it's locked, which is the same whatever it's
  // been left at since the last frame)
  _liM3.multiplyMatrices(out, up.matrixWorld); carryMat(_liM2, _liM3, k).invert().premultiply(_liM3).multiply(_liM3.invert());
  return out.invert().multiply(_liM2);
}
export function fpReloadPose(gg, k) {
  const D = W(curId()), w = adsW(); k *= 1 - w; if (!fpOn() || !gg.parent || !D || D.melee || D.akimbo) return;
  // (out from your eye at the hip, then up into view to reload)
  viewMat(_rlM);   // (the view as it is this frame: the camera's placed after the hold)
  { const m = MUZ[W8.cur] || 0.9, L = FP_REACH.len, push = (FP_REACH.short + (FP_REACH.long - FP_REACH.short) * clamp((m - L[0]) / (L[1] - L[0]), 0, 1)) * (1 - w) * (1 - k) * (1 - smooth(clamp(ANIM.ready || 0, 0, 1)));
    // (not at a sprint, the gun drawn in to your chest; and kept out to the side through a reload, not brought back
    // to the middle for it: hs)
    const hs = (1 - w) * (1 - smooth(clamp(ANIM.ready || 0, 0, 1)));
    const HP = FP_HIP_GUN[curId()] || FP_HIP;
    if (hs > 0.002) { _rlD.set(HP.x * hs, HP.y * hs, -push).applyQuaternion(_rlQ); gg.updateMatrixWorld(true); _rlC.setFromMatrixPosition(gg.matrixWorld).add(_rlD); gg.position.copy(gg.parent.worldToLocal(_rlC)); gg.updateMatrix(); gg.updateMatrixWorld(true); } }
  k *= FP_RELOAD.k;
  const h = HOLDS[W8.cur] && HOLDS[W8.cur].R; if (!h) return;
  if (k >= 0.01) {
    const side = D.slot === 'side', at = side ? FP_RELOAD.side : FP_RELOAD.at;
    gg.updateMatrixWorld(true); _rlC.set(X, GUN_Y, (MUZ[W8.cur] || 0.9) * FP_RELOAD.mid).applyMatrix4(h.matrixWorld);
    const hs = (1 - w) * (1 - smooth(clamp(ANIM.ready || 0, 0, 1)));   // (out at the side, where it's held at the hip)
    _rlD.set(at[0] + (FP_HIP_GUN[curId()] || FP_HIP).x * hs, at[1] + (FP_HIP_GUN[curId()] || FP_HIP).y * hs, at[2]).applyMatrix4(_rlM).sub(_rlC).multiplyScalar(k);   // (where it's to go, from where it is)
    _rq.copy(_rlQ); _rq2.copy(_rq).multiply(_vcQ.setFromEuler(_rE.set(FP_RELOAD.pitch * k, FP_RELOAD.yaw * k, FP_RELOAD.roll * k, 'YXZ'))).multiply(_vcQ.copy(_rq).invert());
    _rM.makeTranslation(-_rlC.x, -_rlC.y, -_rlC.z).premultiply(_rM2.makeRotationFromQuaternion(_rq2)).premultiply(_rM2.makeTranslation(_rlC.x + _rlD.x, _rlC.y + _rlD.y, _rlC.z + _rlD.z));
    _rM.multiply(gg.matrixWorld).premultiply(_rM2.copy(gg.parent.matrixWorld).invert());
    _rM.decompose(gg.position, gg.quaternion, gg.scale); gg.updateMatrix(); gg.updateMatrixWorld(true);
  }
  // (a hand at the action: the charging handle, the slide, the bolt; ANIM.chW, psW and boltG, player/hold.js)
  const cw = (ANIM.chW || 0) * (1 - w), sw = (ANIM.psW || 0) * (1 - w), bw = (ANIM.boltG || 0) * (1 - w), fw = (ANIM.fdW || 0) * (1 - w) * (1 - (ANIM.boltG || 0));
  if (cw + sw + bw + fw < 0.002) return;
  const ax = FP_CHARGE.x * cw + FP_SLIDE.x * sw + FP_BOLT.x * bw + FP_FEED.x * fw, ay = FP_CHARGE.y * cw + FP_SLIDE.y * sw + FP_BOLT.y * bw + FP_FEED.y * fw, az = FP_CHARGE.z * cw + FP_SLIDE.z * sw + FP_BOLT.z * bw + FP_FEED.z * fw, ar = FP_CHARGE.roll * cw + FP_SLIDE.roll * sw + FP_BOLT.roll * bw + FP_FEED.roll * fw;
  _rlC.set(X, GUN_Y, (MUZ[W8.cur] || 0.9) * FP_RELOAD.mid).applyMatrix4(h.matrixWorld);
  _rlD.set(ax, ay, az).applyQuaternion(_rlQ);
  _rq2.copy(_rlQ).multiply(_vcQ.setFromEuler(_rE.set(0, 0, ar, 'YXZ'))).multiply(_vcQ.copy(_rlQ).invert());
  _rM.makeTranslation(-_rlC.x, -_rlC.y, -_rlC.z).premultiply(_rM2.makeRotationFromQuaternion(_rq2)).premultiply(_rM2.makeTranslation(_rlC.x + _rlD.x, _rlC.y + _rlD.y, _rlC.z + _rlD.z));
  _rM.multiply(gg.matrixWorld).premultiply(_rM2.copy(gg.parent.matrixWorld).invert());
  _rM.decompose(gg.position, gg.quaternion, gg.scale); gg.updateMatrix(); gg.updateMatrixWorld(true);
}
// looking the gun over from your own eyes (player/inspect.js): held up in front of them, its middle (mid of the way along
// it) brought by k to a place low in the middle of the view (at: across, up, out from your eye; a handgun's nearer),
// where its turns (made on it as it's held: player/hold.js) show it from every side; dx, dy, dz: each pose's own shift
// of it from there (across, up, out from your eye)
const FP_INSPECT_AT = { long: [0.07, -0.1, -0.74], side: [-0.01, -0.035, -0.42], mid: 0.5, midLong: 0.4 };
export function fpInspectPose(gg, k, dx = 0, dy = 0, dz = 0) {
  const D = W(curId()); if (!fpOn() || !(k > 0.002) || !gg.parent || !D || D.melee) return;
  const h = HOLDS[W8.cur] && HOLDS[W8.cur].R; if (!h) return;
  viewMat(_rlM); const at = D.slot === 'side' ? FP_INSPECT_AT.side : FP_INSPECT_AT.long;
  gg.updateMatrixWorld(true); _rlC.set(X, GUN_Y, (MUZ[W8.cur] || 0.9) * (D.slot === 'side' ? FP_INSPECT_AT.mid : FP_INSPECT_AT.midLong)).applyMatrix4(h.matrixWorld);
  _rlD.set(at[0] + dx, at[1] + dy, at[2] - dz).applyMatrix4(_rlM).sub(_rlC).multiplyScalar(k);
  _rM.makeTranslation(_rlD.x, _rlD.y, _rlD.z).multiply(gg.matrixWorld).premultiply(_rM2.copy(gg.parent.matrixWorld).invert());
  _rM.decompose(gg.position, gg.quaternion, gg.scale); gg.updateMatrix(); gg.updateMatrixWorld(true);
}
// your own arms, from your own eyes: whatever of them comes nearer your eye than SELF_CLIP.near (further looking up:
// up) can be cut away by a plane across the view (SELF_PLANES) on the arms' materials (not the gun's, nor a melee
// weapon's). It's at the eye itself now, cutting nothing in view: a sleeve sliced off there showed as a hollow wedge,
// and with the arms carried round with the view (fpCarry) they never come at your eyes anyway. Out of first person it's put
// far off
const SELF_CLIP = { near: 0, up: 0 }, SELF_PLANES = [new THREE.Plane(new V3(0, 1, 0), 1e6)], _scD = new V3(), _scP = new V3();
R.localClippingEnabled = true;
function selfClip(on, c) {
  const pl = SELF_PLANES[0];
  if (on) c.layers.disable(BACK_LAYER); else FP_CAM.layers.enable(BACK_LAYER);   // (and what rides on your back's left out: player/stow.js)
  if (!on) { pl.normal.set(0, 1, 0); pl.constant = 1e6; return; }
  const walk = o => { if (o === gunMeshes.melee) return; if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.clippingPlanes !== SELF_PLANES) { o.material.clippingPlanes = SELF_PLANES; o.material.needsUpdate = true; } o.children.forEach(walk); };
  walk(PM.armL); walk(PM.armR);
  c.getWorldDirection(_scD);
  const d = SELF_CLIP.near + SELF_CLIP.up * smooth(clamp((VCAM.pitch - 0.1) / 0.6, 0, 1));
  pl.setFromNormalAndCoplanarPoint(_scD, _scP.copy(c.position).addScaledVector(_scD, d));
}
// at the hip from your own eyes, how far the gun's own kick has it turned off the crosshair, in pixels across and down
// the screen (out): its flip, the climb of a full auto and its rattle, the turn fpRecoil puts on it over the crosshair's
// own kick. The crosshair's drawn that much further over (ui/crosshair.js) and each round goes out through it
// (weapons/firing.js), so the barrel, the crosshair and the tracers all climb together instead of the gun going up while
// the rounds stay down where it pointed before the shooting began
function fpKickPx(out) {
  out[0] = out[1] = 0; if (!fpOn() || P.dead) return out;
  const k = 1 - adsW(); if (k < 0.01) return out;
  const C = V.rc, rn = rattleAt(), p = (C.p + C.cp + rn[3]) * k, y = (C.y + C.cy + rn[4]) * k;
  const f = innerHeight / 2 / Math.tan(FP_CAM.fov * Math.PI / 360);
  out[0] = -Math.tan(y) * f; out[1] = -Math.tan(p) / Math.cos(y) * f; return out;
}
// where the crosshair's drawn and the rounds go through (screen pixels): the aim (the cursor with its sway, wander and
// kick: player/shaky-hands.js), and from your own eyes at the hip the gun's own kick on top (fpKickPx)
const _xk = [0, 0];
export function xhAt(out) { fpKickPx(_xk); out[0] = clamp(aimSX() + _xk[0], 0, innerWidth); out[1] = clamp(aimSY() + _xk[1], 0, innerHeight); return out; }
// the gun's own sway from your own eyes (VM): where its springs are headed this frame, and stepped on to it
function vmStep(rdt, w0, now) {
  if (!(rdt > 0)) return;
  const fx = Math.sin(V.cy), fz = Math.cos(V.cy), fwd = P.vx * fx + P.vz * fz, right = P.vx * -fz + P.vz * fx, m = 1 - VM.ads * w0;
  const turn = clamp(angDiff(V.cy, V.lcy ?? V.cy) / rdt, -8, 8); V.lcy = V.cy;
  const lt = clamp(turn, -VM_LOOK.max, VM_LOOK.max), lp = clamp((V.cp - (V.lcp ?? V.cp)) / rdt, -VM_LOOK.max, VM_LOOK.max); V.lcp = V.cp;
  const k = V.bobK || 0, ph = P.phase || 0, still = 1 - clamp(k * 2, 0, 1), B = VM.bob;
  // (turning at a sprint the arms and gun aren't nailed to the view: they trail it a little on the springs, swung out
  // to the side and leant into the turn, and settle back with a hint of overshoot as it ends: VM_RUN)
  const rk = 1 + (VM_RUN.k - 1) * clamp(ANIM.sprintK || 0, 0, 1);
  const hx = XR.hx || 0, hy = XR.hy || 0, H = VM_HOLD;
  const T = { x: (-right * VM.lag + B[0] * k * Math.sin(ph) - turn * VM_RUN.side * (rk - 1) + lt * VM_LOOK.x + H.x * hx) * m, y: (-B[1] * k * (0.5 - 0.5 * Math.cos(2 * ph)) + VM.breathe[0] * still * Math.sin(now * 1.6) - lp * VM_LOOK.y + H.y * hy) * m, z: Math.max(0, fwd) * VM.fwd * m,
    p: (-Math.max(0, fwd) * VM.fwd * 2 + VM.breathe[1] * still * Math.sin(now * 1.6 + 0.6) - lp * VM_LOOK.pitch - VM_BOB_ROT.pitch * k * (0.5 - 0.5 * Math.cos(2 * (ph - VM_BOB_ROT.lag))) + H.pitch * hy) * m, w: clamp(-turn * VM_RUN.yaw * (rk - 1) - lt * VM_LOOK.yaw + VM_BOB_ROT.yaw * k * Math.sin(ph - VM_BOB_ROT.lag) - H.yaw * hx, -VM_RUN.max, VM_RUN.max) * m, r: (-right * VM.roll - turn * VM.turn * rk + B[2] * k * Math.sin(ph)) * m };
  for (let n = Math.ceil(rdt / (1 / 120)), h = rdt / Math.max(1, n), i = 0; i < n; i++) for (const a of ['x', 'y', 'z', 'p', 'w', 'r']) { const va = 'v' + a; VS[va] += (VM.k * (T[a] - VS[a]) - VM.d * VS[va]) * h; VS[a] += VS[va] * h; }
  // and down the sights (ADS_SWAY: V.asY, V.asP, put on in fpSightAlign)
  // (its own share of the stride: the view's bob, bobK, is mostly taken off down the sights)
  V.abK = (V.abK || 0) + (clamp(Math.hypot(P.vx, P.vz) / BOB.speed, 0, BOB.max) * (P.moving ? 1 : 0) - (V.abK || 0)) * (1 - Math.exp(-rdt * BOB.ease));
  const A = ADS_SWAY, lag = VM_BOB_ROT.lag, ka = V.abK, ay = clamp(A.bob[0] * ka * Math.sin(ph - lag) - lt * A.look - A.idle[0] * hx, -A.max, A.max), ap = clamp(-A.bob[1] * ka * (0.5 - 0.5 * Math.cos(2 * (ph - lag))) - lp * A.look + A.breathe * still * Math.sin(now * 1.6 + 0.6) + A.idle[1] * hy, -A.max, A.max);
  if (V.asY === undefined) V.asY = V.asP = V.vasY = V.vasP = 0;
  for (let n = Math.ceil(rdt / (1 / 120)), h = rdt / Math.max(1, n), i = 0; i < n; i++) { V.vasY += (A.k * (ay - V.asY) - A.d * V.vasY) * h; V.asY += V.vasY * h; V.vasP += (A.k * (ap - V.asP) - A.d * V.vasP) * h; V.asP += V.vasP * h; }
}
// and put on the gun as it's held (player/hold.js: after fpRecoil), turned about where it's gripped in the view's own frame
const _vsP = new V3(), _vsO = new V3();
export function fpViewSway(gg, grip) {
  if (!fpOn() || !gg.parent) return;
  // (turned about where it's gripped: the gun's own group sits down at your feet, and a sway's tilt turned about there
  // would swing the gun centimetres back and aside, trailing every step and sidestep)
  gg.updateMatrixWorld(true); _vsP.set(grip[0], grip[1], grip[2]).applyMatrix4(gg.matrixWorld);
  _rq.setFromEuler(_rE.set(armsP(), armsY() + Math.PI, viewR(), 'YXZ'));
  _rq2.copy(_rq).multiply(_vcQ.setFromEuler(_rE.set(VS.p, VS.w, VS.r, 'YXZ'))).multiply(_vcQ.copy(_rq).invert());
  _vsO.set(VS.x, VS.y, VS.z).applyQuaternion(_rq);
  _rM.makeTranslation(-_vsP.x, -_vsP.y, -_vsP.z).premultiply(_rM2.makeRotationFromQuaternion(_rq2)).premultiply(_rM2.makeTranslation(_vsP.x + _vsO.x, _vsP.y + _vsO.y, _vsP.z + _vsO.z));
  _rM.multiply(gg.matrixWorld).premultiply(_rM2.copy(gg.parent.matrixWorld).invert());
  _rM.decompose(gg.position, gg.quaternion, gg.scale); gg.updateMatrix(); gg.updateMatrixWorld(true);
}
// at the hip, the shot's turn of the gun put on the gun as it's held (player/hold.js: after fpSightAlign, before your
// hands go on it), about where it's gripped, turned as the view is; less of it as the sights come up (they take it there)
const _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _vcQ = new THREE.Quaternion(), _rE = new THREE.Euler(), _rp = new V3(), _rM = new THREE.Matrix4(), _rM2 = new THREE.Matrix4();
export function fpRecoil(gg, grip) {
  const C = V.rc, k = 1 - adsW(); if (!fpOn() || !gg.parent || k < 0.01) return;
  const rn = rattleAt(), F = C.kind === 'hand' ? FP_RECOIL.hand : FP_RECOIL.long;
  // (and turned left and right with the crosshair as a shot kicks it aside or it sways: the gun at the hip points where
  // the crosshair is, so the two go across together, FP_XH_YAW of it)
  // (not the crosshair's move across the screen with a free look, Alt, FREE_LOOK: the view's turned off the aim then,
  // not the gun, which stays where it was in front of you)
  // (the aim's place off the middle of the arms' own view, and the crosshair's sway and kick off it: its own offset
  // from where the mouse is held, unless the free look has the aim off the screen, where that offset's clamped)
  const ax = fpAimPx(true)[0], mx = innerWidth / 2 + fpAimPx()[0], sw = mx > 0 && mx < innerWidth ? aimSX() - mx : 0;
  const tf = Math.tan(FP_CAM.fov * Math.PI / 360) / (innerHeight / 2), xa = Math.atan((V.fly || V.flp ? ax + sw : aimSX() - innerWidth / 2) * tf) * FP_XH_YAW;
  // (and up and down with it the same way: a shot's kick up the screen tips the muzzle up with it, so the crosshair's
  // kick and the gun's are one and the same, xhKick in player/shaky-hands.js)
  const ay = fpAimPx(true)[1], my = innerHeight / 2 + fpAimPx()[1], sv = my > 0 && my < innerHeight ? aimSY() - my : 0;
  const ya = Math.atan(-(V.fly || V.flp ? ay + sv : aimSY() - innerHeight / 2) * tf) * FP_XH_YAW;
  // (and the stock settling into your shoulder, V.sh: fpShoulder, fpAds)
  const S = V.sh, p = (C.p + C.cp + rn[3] + ya + S.p) * k, y = (C.y + C.cy + rn[4] - xa + S.y) * k, r = (C.r + rn[5] + S.r) * k;
  if (Math.abs(p) + Math.abs(y) + Math.abs(r) + Math.abs(C.z) + Math.abs(S.z) + Math.abs(C.h) + Math.abs(C.x) < 1e-6) return;
  gg.updateMatrixWorld(true);
  // (the turn made in the view's own frame: the view's way, then the turn, then back out of the view's way)
  _rq.setFromEuler(_rE.set(armsP(), armsY() + Math.PI, viewR(), 'YXZ'));
  // turned about your wrists or your shoulder (F.pivot, from where it's gripped, in the view's own frame)
  _rp.set(grip[0], grip[1], grip[2]).applyMatrix4(gg.matrixWorld).add(_vcZ.set(F.pivot[0], F.pivot[1], F.pivot[2]).applyQuaternion(_rq));
  _rq2.copy(_rq).multiply(_vcQ.setFromEuler(_rE.set(p, y, r, 'YXZ'))).multiply(_vcQ.copy(_rq).invert());
  _vcZ.set((C.x + rn[0]) * k, (C.h + rn[1]) * k, (C.z + rn[2] + S.z) * k).applyQuaternion(_rq);   // (across, up, and back toward you along the view)
  _rM.makeTranslation(-_rp.x, -_rp.y, -_rp.z).premultiply(_rM2.makeRotationFromQuaternion(_rq2)).premultiply(_rM2.makeTranslation(_rp.x + _vcZ.x, _rp.y + _vcZ.y, _rp.z + _vcZ.z));
  _rM.multiply(gg.matrixWorld).premultiply(_rM2.copy(gg.parent.matrixWorld).invert());
  _rM.decompose(gg.position, gg.quaternion, gg.scale); gg.updateMatrix(); gg.updateMatrixWorld(true);
}
// the free camera put somewhere, looking a given way (yaw round from +z, pitch up)
function freeTo(x, y, z, yaw, pitch) { V.fx = x; V.fy = y; V.fz = z; V.fyaw = yaw; V.fpitch = pitch; V.vx = V.vy = V.vz = 0; }
// the wheel in the free camera: how fast it flies
export function freeWheel(dy) { V.speed = clamp(V.speed * Math.exp(-dy * 0.0015), FREE.min, FREE.max); }
// the lock's gone without being let go (Esc, or the window losing focus): the game pauses, as in any shooter
// (input/keyboard-mouse.js)
document.addEventListener('pointerlockchange', () => { V.lockPend = 0; if (locked()) return; const s = selfUnlock; selfUnlock = false; if (!s && !isoOn() && performance.now() - (V.lockAt || 0) > LOCK.grace) lockLost(); });
document.addEventListener('pointerlockerror', () => { V.lockPend = 0; });

// which way the keys walk you in first person: forward where you face, and to its sides (the isometric view's own
// otherwise: screen up and screen right)
const MV_F = { x: 0, z: 1 }, MV_R = { x: -1, z: 0 };
export function moveBasis(F, R) { return fpOn() ? viewBasis() : [F, R]; }
// the way the view faces on the ground, and its right
export function viewBasis() {
  const y = freeOn() ? V.fyaw : V.cy; MV_F.x = Math.sin(y); MV_F.z = Math.cos(y); MV_R.x = -MV_F.z; MV_R.z = MV_F.x;
  return [MV_F, MV_R];
}
// where you're aiming in first person, out along the look: the ground where it meets it, a wall in the way, or a long
// way out; and the height the look's at there (VCAM.aimY: the arms point the gun at it, and an unaimed round flies to it)
// down the sights the shot goes where the reticle is, not where the view looks: along the sight's own line (the
// optic's axis, the rear sight over the front), so wherever the sway or a shot's kick has the reticle, that's where it
// lands. Blended in as the sights come up (SIGHT_SHOT, of the way up) and out as they go down
const SIGHT_SHOT = [0.35, 0.85];
export function fpAim(out) {
  let cp = Math.cos(VCAM.pitch), sp = Math.sin(VCAM.pitch), dx = Math.sin(VCAM.yaw), dz = Math.cos(VCAM.yaw);
  const ex = V.x, ey = V.y, ez = V.z, sw = smooth(clamp((V.sdW - SIGHT_SHOT[0]) / (SIGHT_SHOT[1] - SIGHT_SHOT[0]), 0, 1));
  if (sw > 0) {
    const d = V.sd, x = dx * cp + (d.x - dx * cp) * sw, y = sp + (d.y - sp) * sw, z = dz * cp + (d.z - dz * cp) * sw, n = Math.hypot(x, y, z) || 1, h = Math.hypot(x, z) || 1e-6;
    cp = h / n; sp = y / n; dx = x / h; dz = z / h;
  }
  let D = 26;
  if (sp < -1e-3) D = Math.min(D, ey / -sp * cp);
  for (let t = 0.3; t < D; t += 0.1) if (bulletBlocked(ex + dx * t, ez + dz * t)) { D = t; break; }
  D = Math.max(0.6, thinRay(ex, ez, dx, dz, D));
  out.set(ex + dx * D, GUN_Y, ez + dz * D);
  // (how far that is along the line itself, from your eye, nearer if it's a zombie in the way: the crosshair sits out on
  // whatever's there, ui/crosshair.js)
  { let dz2 = D; for (const z of zombies) { if (z.dead) continue; const rx = z.x - ex, rz = z.z - ez, t = rx * dx + rz * dz; if (t > 0.2 && t < dz2 && Math.abs(rx * dz - rz * dx) < 0.32 * (z.T.scale || 1)) dz2 = t; }
    VCAM.aimD = Math.min(dz2 / Math.max(0.05, cp), 60); }
  VCAM.aimY = clamp(ey + sp / Math.max(0.05, cp) * D, 0, 40);   // (up into the sky as far as you look: a round flies the line you look down)
  return out;
}
// a shot kicks the view up and a touch aside (game/camera.js: fireCam), on a stiff spring home; and the gun in your
// hands (FP_RECOIL): its kick, the climb of a full auto and the rattle
const POW_FLIP = 0.4;
export function viewKick(pw, auto) {
  if (isoOn()) return;
  // (which way this one goes: up and off to a side, FP_RECOIL.dir)
  // (at the hip the gun follows the crosshair's own kick aside, fpRecoil, so only down the sights does it pick its own way)
  const DR = FP_RECOIL.dir, th = clamp(DR.bias + DR.spread * adsW() * (rand() + rand() + rand() - 1.5) * 1.4, -DR.max, DR.max), ku = Math.cos(th), ks = Math.sin(th);
  // (a gun can kick up less and swing aside more than most: its climbK and fpSideK, weapons/gun-stats.js: the LMG)
  const D = W(curId()), upK = ((D && D.climbK) || 1) * ((D && D.kickUp) || 1), sdK = ((D && D.fpSideK) || 1) * ((D && D.kickSide) || 1);   // (and its tiers': game/run-state.js)
  const KF = KICK_FEEL, first = (V.rc.t - (V.rc.last ?? -9)) > 0.3 ? KF.first : 1, vary = rr(KF.vary[0], KF.vary[1]) * first;
  const aw = 1 - FPV.adsKick * adsW(), kv = pw * FPV.kick * 22 * (auto ? 0.6 : 1) * aw * vary; V.vk += kv * ku * upK; V.vky += (kv * ks + pw * FPV.kick * 3 * rr(-0.5, 0.5) * aw) * sdK;   // (less down the sights: adsKick)
  // (the roll to a side, and the shudder: KICK_FEEL)
  V.vkr = (V.vkr || 0) + pw * KF.roll * 22 * aw * vary * (rand() < 0.5 ? -1 : 1) * (auto ? 0.7 : 1);
  if (SHUD.length > 6) SHUD.shift();
  SHUD.push({ a: pw * KF.shake * aw * vary * (auto ? 0.6 : 1), t: 0, f: [rr(KF.hz[0], KF.hz[1]), rr(KF.hz[0], KF.hz[1]), rr(KF.hz[0], KF.hz[1])], ph: [rand() * 6.28, rand() * 6.28, rand() * 6.28] });
  if ((V.ff || 0) < FIRE_FOV.max) V.vff = (V.vff || 0) + pw * FIRE_FOV.punch * (auto ? FIRE_FOV.auto : 1) * 10;
  const C = V.rc, hand = !!D && D.slot === 'side', F = hand ? FP_RECOIL.hand : FP_RECOIL.long, AU = FP_RECOIL.auto, R = FP_RECOIL.rattle;
  const act = EJECT[curId()], a = (act === 'pump' || act === 'bolt' ? FP_RECOIL.act : 1) * (D && D.ammo === 'shells' ? FP_RECOIL.shells : 1) * (auto ? AU.k : 1), q = Math.min(pw, 1.25);
  // (a bolt gun comes back off its kick slower, boltRet of the spring's speed, settling into working the bolt rather
  // than snapping back flat before it; the impulse is for the same height on the slower spring)
  const w = F.w * (act === 'bolt' ? FP_RECOIL.boltRet : 1);
  C.kind = hand ? 'hand' : 'long'; C.w = w; C.d = 2 * F.z * w;
  // (an impulse for the size it's to reach at its most, on this spring)
  const v = 1 / (Math.exp(-F.z / Math.sqrt(1 - F.z * F.z) * Math.atan(Math.sqrt(1 - F.z * F.z) / F.z)) / w);
  const room = 1 - 0.5 * clamp(C.p / (F.flip + F.flipPw), 0, 1);   // (less room to flip it up the higher it already is)
  // (the gun itself flips up with only part of a hotter powder's extra climb, POW_FLIP: the aim takes all of it, and
  // the whole of it on the gun had a battle rifle on max powder rearing up off the sights)
  const upG = 1 + (((D && D.kickUp) || 1) - 1) * POW_FLIP, upF = ((D && D.climbK) || 1) * upG;
  const fl = (F.flip + F.flipPw * q) * a * room * rr(0.85, 1.15) * v; C.vp += fl * ku * upF; C.vy += fl * ks * rr(0.6, 1) * sdK;
  C.vz += (F.back + F.backPw * q) * a * (D && D.ammo === 'shells' ? FP_RECOIL.shellsBack / FP_RECOIL.shells : 1) * rr(0.85, 1.15) * v; C.vh += F.up * (0.5 + q) * a * rr(0.7, 1.2) * v;
  C.vr += F.roll * (0.4 + q) * a * rr(0.5, 1) * (rand() < 0.5 ? -1 : 1) * v; C.vy += F.yaw * (0.4 + q) * a * rr(-1, 1) * v * sdK; C.vx += F.side * (0.5 + q) * a * rr(-1, 1) * v * sdK;
  // held on the trigger: the climb, wandering as it goes (a shot more than a beat after the last starts it afresh)
  const now = C.t;   // (the kick's own clock: recoilStep)
  if (auto) { if (now - C.last > 0.3) { C.tp = 0; C.ty = 0; } C.tp = Math.min(AU.max * upK, C.tp + AU.climb * (0.6 + q) * rr(0.7, 1.3) * upK); C.ty = clamp(C.ty + AU.climb * AU.wander * rr(-1, 1) * (0.6 + q) * sdK, -AU.max * 0.5 * sdK, AU.max * 0.5 * sdK); }
  C.last = now;
  C.e = Math.min(1.6, C.e + (auto ? R.auto : R.semi) * (0.5 + q));   // (the rattle: harder the heavier the gun)
}
// the rattle this frame: [across, up, back, pitch, twist, roll], a fast buzz dying away with the shots
const _rn = [0, 0, 0, 0, 0, 0];
function rattleAt() {
  const C = V.rc, R = FP_RECOIL.rattle, e = C.e * C.e;
  for (let i = 0; i < 6; i++) { const f = R.f[i % 3], ph = C.ph[i]; _rn[i] = e * (Math.sin(ph) + 0.55 * Math.sin(ph * 1.71 + i)) / 1.55 * (i < 3 ? R.pos * (i === 2 ? 0.5 : 1) : R.rot * (i === 5 ? 1.3 : 1)); }
  return _rn;
}
// the kick, the climb and the rattle stepped on
function recoilStep(rdt) {
  const C = V.rc, k = C.w * C.w, d = C.d, AU = FP_RECOIL.auto, R = FP_RECOIL.rattle, now = C.t += rdt;
  if (now - C.last > 0.12) { const b = Math.exp(-rdt * AU.back); C.tp *= b; C.ty *= b; }   // (let go of the trigger, it settles back down)
  for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
    for (const a of ['p', 'y', 'r', 'z', 'x', 'h']) { const va = 'v' + a; C[va] += (-k * C[a] - d * C[va]) * h; C[a] += C[va] * h; }
    const cw = AU.w; C.vcp += (cw * cw * (C.tp - C.cp) - 2 * cw * C.vcp) * h; C.cp += C.vcp * h; C.vcy += (cw * cw * (C.ty - C.cy) - 2 * cw * C.vcy) * h; C.cy += C.vcy * h;
  }
  C.e *= Math.exp(-rdt * R.decay);
  for (let i = 0; i < 6; i++) C.ph[i] += rdt * R.f[i % 3] * 2 * Math.PI * (1 + 0.13 * i) * (1 + 0.25 * Math.sin(C.t * (1.3 + 0.4 * i) + i));   // (each axis its own, its pace drifting a little, never jumping frame to frame)
}
// where the sounds are heard from, and which way's right: your eyes, or the free camera
export function listener() { return freeOn() ? { x: V.fx, y: V.fy, z: V.fz, rx: -Math.cos(V.fyaw), rz: Math.sin(V.fyaw) } : { x: V.x, y: V.y, z: V.z, rx: -Math.cos(V.cy), rz: Math.sin(V.cy) }; }
// the ground under the view, for what's laid out round it (the camera's target: game/camera.js)
export function viewGround(t) { if (freeOn()) t.set(V.fx + Math.sin(V.fyaw) * 4, 0, V.fz + Math.cos(V.fyaw) * 4); else t.set(P.x, 0, P.z); }
// a point's on the screen this frame (a projected point behind a perspective camera comes out mirrored, past z 1)
export const onScreen = v => v.z < 1 && v.z > -1;

// ---- down the sights in first person. Each gun's sight line, in the frame of what carries it: an optic's own axis
// (weapons/attachments.js notes it on the optic), or its iron sights' (each gun's model notes them: weapons/gun-parts.js,
// irons), from the rear sight to the front sight's tip: over a notch's floor with the post's tip level with its top
// (equal height, equal light), through the middle of an aperture, or along a shotgun's rib to its bead. On a long gun
// your cheek's on the stock, IRON.pull up it from the butt (between IRON.cheek and IRON.far from the rear sight); an
// aperture's close in front of your eye (IRON.peep), too close to see sharp, the front post sharp in the blur of its
// ring and the rest of the rear sight (blurred for it: effects/scope-view.js); a
// handgun's held out at arm's length. A gun without its sights noted has them found by feeling down onto its top along
// its middle, over its front IRON.front of its length, the rear sight the furthest back of its top that comes up near
// that height (within IRON.rear), the line over it (IRON.peek) and clear of what's between
const IRON = { front: 0.42, step: 0.004, rear: 0.016, peek: 0.0022, cheek: 0.05, far: 0.22, pull: 0.26, long: 0.45, peep: 0.07 };
// and never nearer your eye than IRON_CLEAR.eye to any of the rear sight that reaches back toward it: its ears and
// the block round an aperture (found within IRON_CLEAR.r of the line, up to IRON_CLEAR.back behind the rear sight).
// An aperture's held IRON.peep in front of your eye, but the AR's carry handle ears reach 2.5 cm further back than its
// ring, so they sat 4.7 cm off the eye, and a hard kick turning the gun about your eye swung them out to the side,
// nearer the camera's flat near plane, and through it
const IRON_CLEAR = { eye: 0.072, r: 0.03, back: 0.12 }, _scV = new V3(), _scM = new THREE.Matrix4();
function sightBack(meshes, frame, x, y, z) {
  frame.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert(); let back = 0;
  for (const o of meshes) { const p = o.geometry.attributes.position; _scM.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < p.count; i++) { _scV.fromBufferAttribute(p, i).applyMatrix4(_scM); const d = z - _scV.z;
      if (d > back && d < IRON_CLEAR.back && Math.abs(_scV.x - x) < IRON_CLEAR.r && Math.abs(_scV.y - y) < IRON_CLEAR.r) back = d; } }
  return back;
}
// a bolt worked down the sights comes straight back along the line toward your eye (the hunting rifle's 13 cm, from
// 7.7 cm in front of it to past it, just under the line): your head comes back off the stock with it, the eye eased
// back off it by however far it would otherwise come inside BOLT_CLEAR.near
// of it (and only its body near the line, within BOLT_CLEAR.r; softly, over knee, so it starts and stops gently). What
// slides that carries the sight isn't counted: a handgun's slide, whose sights the eye's kept on (slideBack)
const BOLT_CLEAR = { near: 0.07, knee: 0.015, r: 0.04, ahead: 0.03, f: 0 }, _bcB = new THREE.Box3(), _bcV = new V3(), _bcR = new V3(), _bcA = new V3();
function boltClear(L, eye, w) {
  let need = 0; BOLT_CLEAR.f++;
  for (const m of L.moving) {
    let carries = false; for (let p = L.obj; p; p = p.parent) if (p === m) { carries = true; break; }
    if (carries || !m.visible) continue;
    // (where it'll be this frame: it's worked after the view's placed, player/hold.js, so it's taken on as far again as
    // it came last frame; a frame behind, a bolt snapped back 4 cm nearer than it was cleared for)
    // (only from the frame just gone, and no more than BOLT_CLEAR.ahead: come down the sights mid-stroke, the last it was
    // seen could be from long before)
    const r = m.userData.slideRest, dz = m.position.z - r.z0, ud = m.userData, ahead = ud.bcF === BOLT_CLEAR.f - 1 ? clamp(dz - ud.bcLast, -BOLT_CLEAR.ahead, BOLT_CLEAR.ahead) : 0; ud.bcLast = dz; ud.bcF = BOLT_CLEAR.f;
    m.updateMatrixWorld(true); _bcA.set(0, 0, ahead); if (m.parent) _bcA.transformDirection(m.parent.matrixWorld).multiplyScalar(Math.abs(ahead));
    m.traverse(o => { if (!o.isMesh || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _bcB.copy(o.geometry.boundingBox);
      for (let i = 0; i < 8; i++) { _bcV.set(i & 1 ? _bcB.max.x : _bcB.min.x, i & 2 ? _bcB.max.y : _bcB.min.y, i & 4 ? _bcB.max.z : _bcB.min.z).applyMatrix4(o.matrixWorld).add(_bcA).sub(eye);
        const along = _bcV.dot(_sd); _bcR.copy(_bcV).addScaledVector(_sd, -along); if (_bcR.length() > BOLT_CLEAR.r) continue;   // (and behind your eye too: the hunting rifle's bolt comes back 13 cm, from 7.7 in front of it)
        need = Math.max(need, BOLT_CLEAR.near - along); } });
  }
  if (need <= -BOLT_CLEAR.knee) return;
  const K = BOLT_CLEAR.knee, x = need + K, off = x < 2 * K ? x * x / (4 * K) : x - K;
  eye.addScaledVector(_sd, -off * w);
}
const SL = { key: null, obj: null, a: new V3(), b: new V3(), kind: 'iron', relief: null, r: 0, hw: 0, hh: 0, hide: [], back: 0, moving: [] };
const _ray = new THREE.Raycaster(), _ro = new V3(), _rdn = new V3(), _sb = new THREE.Box3(), _sm = new THREE.Matrix4(), _sm2 = new THREE.Matrix4();
function sightLine() {
  const s = W8.cur, h = HOLDS[s] && HOLDS[s].R, id = curId(); if (!h || !id) return null;
  const key = h.uuid + ':' + id;
  if (SL.key === key) return SL.obj ? SL : null;
  SL.key = key; SL.obj = null; SL.hide = []; SL.back = 0;
  // (what of the gun slides back toward your eye that doesn't carry the sight: a bolt worked down the sights, BOLT_CLEAR)
  SL.moving = []; h.traverse(o => { if (o.userData.slideRest) SL.moving.push(o); });
  let opt = null, ir = null; h.traverse(o => { if (!opt && o.userData.optic) opt = o; if (!ir && o.userData.irons) ir = o; });
  if (opt) {
    const O = opt.userData.optic; SL.obj = opt; SL.kind = O.kind; SL.a.set(O.x, O.y, O.zr); SL.b.set(O.x, O.y, O.zf); SL.relief = O.relief ?? null; SL.r = O.r; SL.hw = O.hw || 0; SL.hh = O.hh || 0;
    opt.traverse(o => { if (o.userData.reticle) SL.hide.push(o); });   // (a sight's own lit dot, drawn instead where your eye sees it)
    return SL;
  }
  h.updateMatrixWorld(true); _sm.copy(h.matrixWorld).invert();
  const meshes = [], b = new THREE.Box3().makeEmpty(); h.traverseVisible(o => { if (o.isMesh && o.geometry) meshes.push(o); });
  for (const o of meshes) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(_sb.copy(o.geometry.boundingBox).applyMatrix4(_sm2.multiplyMatrices(_sm, o.matrixWorld))); }
  if (b.isEmpty()) return null;
  const len = b.max.z - b.min.z, long = len > IRON.long && (W(curId()) || {}).slot !== 'side';   // (a handgun's never held like a long gun, however long a can makes it: its eye stays back off the slide, EYE_MIN.hand)
  if (ir && ir.userData.irons.yf !== undefined) {
    const I = ir.userData.irons; ir.updateMatrixWorld(true);
    SL.obj = ir; SL.kind = I.kind; SL.r = I.r || 0; SL.hw = SL.hh = 0;
    SL.a.set(X, I.yr, I.rz); SL.b.set(X, I.yf, I.fz);
    SL.relief = I.relief ?? (I.kind === 'ap' ? IRON.peep : long ? clamp(I.rz - (b.min.z + IRON.pull), IRON.cheek, IRON.far) : null);   // (a gun's own, where the irons say)
    SL.back = sightBack(meshes, ir, X, I.yr, I.rz); if (SL.relief !== null) SL.relief = Math.max(SL.relief, SL.back + IRON_CLEAR.eye);
    return SL;
  }
  // the top along the middle, front to back
  const prof = [], zf = b.max.z - len * IRON.front;
  _rdn.set(0, -1, 0).transformDirection(h.matrixWorld);
  for (let z = b.min.z; z <= b.max.z; z += IRON.step) {
    _ro.set(X, b.max.y + 0.05, z).applyMatrix4(h.matrixWorld); _ray.set(_ro, _rdn); _ray.far = 1;
    const hit = _ray.intersectObjects(meshes, false)[0]; if (hit) prof.push([z, _ro.copy(hit.point).applyMatrix4(_sm).y]);
  }
  let y = -1e9, tz = 0;
  for (const [z, yy] of prof) if (z >= zf && yy > y) { y = yy; tz = z; }
  if (y < -1e8) return null;
  let rz = tz - 0.3; for (const [z, yy] of prof) if (z < tz - 0.12 && yy >= y - IRON.rear) { rz = z; break; }
  let hr = y;
  for (const [z, yy] of prof) {
    if (z >= rz && z <= rz + 0.06) hr = Math.max(hr, yy + IRON.peek);   // over the rear sight
    else if (z > rz + 0.06 && z < tz - 0.01) hr = Math.max(hr, y + (yy + 0.0008 - y) * (tz - rz) / (tz - z));   // clear of what's between
  }
  SL.obj = h; SL.kind = 'iron'; SL.a.set(X, hr, rz); SL.b.set(X, y, tz); SL.relief = long ? clamp(rz - (b.min.z + IRON.pull), IRON.cheek, IRON.far) : null; SL.r = SL.hw = SL.hh = 0;
  SL.back = sightBack(meshes, h, X, hr, rz); if (SL.relief !== null) SL.relief = Math.max(SL.relief, SL.back + IRON_CLEAR.eye);
  return SL;
}
// a sight on a handgun's slide (its red dot or holo, or its iron sights) rides back with the slide as it cycles and when
// it locks open on an empty mag: how far (out, in the world) the slide it's on is back from where it rests, so the eye
// can be kept where it'd be with the slide home rather than drawn back with it; false if it's not on a slide or the
// slide's home
const _slB = new V3(), _slM = new THREE.Matrix3();
function slideBack(obj, out) {
  for (let p = obj; p; p = p.parent) {
    const r = p.userData && p.userData.slideRest; if (!r) continue;
    const dz = p.position.z - r.z0; if (Math.abs(dz) < 1e-6 || !p.parent) return false;
    out.set(0, 0, dz).applyMatrix3(_slM.setFromMatrix4(p.parent.matrixWorld)); return true;
  }
  return false;
}
// what's hidden while you look down the sights (an aperture's own parts, a sight's lit dot), shown again after
const SL_HID = [];
function sightHide(list) {
  if (SL_HID.length === list.length && SL_HID.every((o, i) => o === list[i])) return;
  SL_HID.forEach(o => { o.visible = true; }); SL_HID.length = 0;
  list.forEach(o => { o.visible = false; SL_HID.push(o); });
}
// how far down the sights you are, eased
// (first person's already eased: fpAds)
const adsW = () => fpOn() ? clamp(ANIM.ads || 0, 0, 1) : smooth(clamp(ANIM.ads || 0, 0, 1));
// which way a round goes from your eye this frame: through the crosshair's point (the middle of the view, wandering
// with sway and kicked by recoil: player/shaky-hands.js), as the view's turned
const _aimE = new THREE.Euler();
function aimDir(out) {
  const f = Math.tan(FP_CAM.fov * Math.PI / 360), hh = innerHeight / 2;
  out.set((aimSX() - innerWidth / 2) / hh * f, -(aimSY() - hh) / hh * f, -1).normalize();
  const k = shoulderShake(); _aimE.set(viewP() + k[0], viewY() + Math.PI + k[1], viewR(), 'YXZ'); return out.applyEuler(_aimE);
}
// down the sights the gun's brought onto your aim exactly, its sight line turned onto the line a round will take, so the
// front post, the dot or the reticle sits on what you'll hit and wanders and kicks with it; and up toward your eye, as
// far as SIGHT_RAISE, the eye coming down onto the line the rest of the way (viewFrame). From the hold (player/hold.js,
// poseGun: gg, the gun in your hands, before your hands are put on it) and again as the view's placed
const SIGHT_RAISE = 0.12;
const _pa = new V3(), _pb = new V3(), _ad = new V3(), _sd = new V3(), _vcH = new V3(), _qa = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _mw = new THREE.Matrix4(), _vcM = new THREE.Matrix4();
const ADS_KNOCK = 0.4, _knR = new V3(), _knU = new V3(0, 1, 0);
const _saX = new V3(1, 0, 0);
export function fpSightAlign(gg, raise = true) {
  const w = adsW(), D = W(curId()); if (!fpOn() || w < 0.001 || !D || D.melee || D.akimbo) return;
  const L = sightLine(); if (!L || !gg.parent) return;
  PM.g.updateMatrixWorld(true);
  _pa.copy(L.a).applyMatrix4(L.obj.matrixWorld); _pb.copy(L.b).applyMatrix4(L.obj.matrixWorld);
  aimDir(_ad); _sd.subVectors(_pb, _pa).normalize();
  // (in the hold, before the view carries the upper body round with its look up or down (fpCarry), onto the aim as it is
  // before that: aimed along the whole view here, the carry turned the gun by the look again on top, and it tipped away
  // from the arms holding it, further the further you looked down)
  if (raise) { const k = V.vlk ?? 1; _fcQ.setFromEuler(_fcR.set(0, VCAM.yaw, 0)); _ad.applyQuaternion(_fcQ.invert()).applyAxisAngle(_saX, VCAM.pitch * k).applyQuaternion(_fcQ.invert()); }
  _qa.setFromUnitVectors(_sd, _ad); _qi.identity().slerp(_qa, w);
  // turned about the line's back end, then raised: the line's offset from your eye, as far as SIGHT_RAISE
  rigEye(_vcH); _vcH.sub(_pa); _vcH.addScaledVector(_ad, -_vcH.dot(_ad)); const off = _vcH.length(); if (off > SIGHT_RAISE) _vcH.multiplyScalar(SIGHT_RAISE / off); _vcH.multiplyScalar(raise ? w : 0);
  // and on the way up or down, the arc it swings through: dipped and canted a touch in the middle of it
  if (raise) { const arc = Math.sin(Math.PI * w), k = shoulderShake(); _qa.setFromAxisAngle(_ad, ADS_T.cant * arc + k[2]); _qi.premultiply(_qa); _vcH.y -= ADS_T.dip * arc; _vcH.addScaledVector(_ad, -k[3]);
    _vcH.add(_faV.set(k[4], k[5], 0).applyEuler(_aimE.set(viewP(), viewY() + Math.PI, viewR(), 'YXZ'))); }   // (and the kick's slide across and up)
  // (and, once it's all on your eye, a reload's knocks put back on as much as ADS_KNOCK: your hands and the gun jolting
  // as a mag's shaken out or slapped home, rather than the gun held dead still down the sights through it)
  if (!raise) { const kn = ADS_KNOCK * w; if (kn > 0.001) { _knR.crossVectors(_ad, _knU).normalize(); _qi.premultiply(_qa.setFromAxisAngle(_knR, -REL_KNOCK.p * kn)).premultiply(_qa.setFromAxisAngle(_ad, REL_KNOCK.r * kn)); } }
  // (and its sway about the middle of the view, ADS_SWAY)
  if (!raise && V.asY !== undefined) { _knR.crossVectors(_ad, _knU).normalize(); _qi.premultiply(_qa.setFromAxisAngle(_knU, V.asY * w)).premultiply(_qa.setFromAxisAngle(_knR, V.asP * w)); }
  _mw.makeTranslation(-_pa.x, -_pa.y, -_pa.z).premultiply(_vcM.makeRotationFromQuaternion(_qi)).premultiply(_vcM.makeTranslation(_pa.x + _vcH.x, _pa.y + _vcH.y, _pa.z + _vcH.z));
  _mw.multiply(gg.matrixWorld).premultiply(_vcM.copy(gg.parent.matrixWorld).invert());
  _mw.decompose(gg.position, gg.quaternion, gg.scale); gg.updateMatrix(); gg.updateMatrixWorld(true);
}
// your eye where your head sits on your chest (a little out toward the gun arm: FPV.side), as the body's posed: on the
// head's own place on the upper body, not the head itself, so its nods and turns don't move the view
function chestEye(out) { const D = W(curId()), h = PM.head; h.parent.updateWorldMatrix(true, false); return out.set(D && D.akimbo ? 0 : FPV.side, FPV.eye[0], FPV.eye[1]).add(h.position).applyMatrix4(h.parent.matrixWorld); }
// and where it is for the view: where you stand, its place over your shoulders (eased: EYE_R) turned with the view
function rigEye(out) {
  if (!EYE_R.on) { chestEye(EYE_R.ref); rigOf(EYE_R.ref, EYE_R.o); EYE_R.t0.copy(EYE_R.o); EYE_R.v.set(0, 0, 0); EYE_R.on = true; }
  const y = VCAM.yaw, c = Math.cos(y), s = Math.sin(y), o = EYE_R.o;
  return out.set(PM.g.position.x + o.x * c + o.z * s, PM.g.position.y + o.y, PM.g.position.z - o.x * s + o.z * c);
}
// a point's place from where you stand, in your chest's own frame (across, up, ahead)
function rigOf(p, out) {
  const y = ANIM.chestYaw ?? ANIM.yaw, c = Math.cos(y), s = Math.sin(y), dx = p.x - PM.g.position.x, dz = p.z - PM.g.position.z;
  return out.set(dx * c - dz * s, p.y - PM.g.position.y, dx * s + dz * c);
}
// each frame, once the body's posed: the eye's place eased onto where the body has it now
const _erT = new V3();
function rigStep(rdt) {
  if (!EYE_R.on) { rigEye(_erT); return; }
  chestEye(EYE_R.ref); rigOf(EYE_R.ref, _erT);
  const vlt = P.vault || ANIM.postVault > 0, w = vlt ? EYE_RIG.vault : EYE_RIG.w, k = w * w, d = 2 * w;
  // over a vault the body moves fast enough that a spring left chasing it trails a hand's breadth or more behind (2v/w):
  // there the spring's also given how fast the eye's place is moving (ff), so it keeps up with the body and only
  // smooths the jolts out of it, eased in and back off so neither end jumps
  if (rdt > 0) { EYE_R.tv.subVectors(_erT, EYE_R.t0).divideScalar(rdt); if (EYE_R.tv.lengthSq() > 64) EYE_R.tv.setLength(8); }
  EYE_R.t0.copy(_erT); EYE_R.ff += ((vlt ? 1 : 0) - EYE_R.ff) * Math.min(1, rdt * 10); const tv = EYE_R.tv, f = d * EYE_R.ff;
  for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
    EYE_R.v.x += (k * (_erT.x - EYE_R.o.x) - d * EYE_R.v.x + f * tv.x) * h; EYE_R.v.y += (k * (_erT.y - EYE_R.o.y) - d * EYE_R.v.y + f * tv.y) * h; EYE_R.v.z += (k * (_erT.z - EYE_R.o.z) - d * EYE_R.v.z + f * tv.z) * h;
    EYE_R.o.addScaledVector(EYE_R.v, h);
  }
}
// the arms' pitch in first person (weapons/combat-update.js: ANIM.pitchT, down positive): the view's own, so the gun's
// always parallel to the view whatever's under the crosshair (a wall, a zombie, the sky), as in any shooter
export const fpGunPitch = () => -VCAM.pitch * EYE_RIG.pitch;
// looking down the sights: what's drawn over the view for them (effects/scope-view.js). on: whether anything is; kind:
// the sight's ('scope', 'acog', 'holo', 'dot', 'ap' an aperture, 'notch', 'bead', 'iron'); eye, obj: the middles of its back (the eyepiece,
// the window, the aperture) and its front; dir: its axis; ux, uy: across it and up it; r: the eyepiece's, the lens's or
// the aperture's radius; hw, hh: a window's half width and height; mag: how much a scope magnifies; a: how much of it
// shows (it comes in as the sights come up); off: where your eye is off a scope's axis, as a share of its eyepiece's
// radius (its shadow)
export const SCOPE_V = { on: false, kind: '', eye: new V3(), obj: new V3(), dir: new V3(), ux: new V3(), uy: new V3(), r: 0.02, hw: 0, hh: 0, mag: 4, a: 0, w: 0, off: new THREE.Vector2() };
// the eye's place off the scope's axis, on a spring: low as it comes up, kicked by a shot, trailing a quick turn
const BOX = { x: 0, y: 0, vx: 0, vy: 0, k: 70, d: 10 };
// how far (metres) your eye can be off a scope's axis and still see all of its picture
const EYEBOX = 0.0095;
// down the sights of anything but a scope, there's no crosshair: you aim with the sights themselves (ui/crosshair.js)
export const fpSighted = () => fpOn() && V.sw > 0.55;
const GLASS_SEE = { on: false };
// whether something's drawn: it and everything it hangs from shown
const drawnUp = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
function glassSee(see) { if (see !== GLASS_SEE.on) { GLASS_SEE.on = see; GM.glass.transparent = see; GM.glass.opacity = see ? 0.12 : 1; GM.glass.depthWrite = !see; GM.glass.needsUpdate = true; GM.holoGlass.opacity = see ? 0.1 : 0.35; } }

// going down from your own eyes: the view's drawn back out of them, up and away over your body as it falls, turning
// to keep it in the middle, until it looks down on it from behind and above (DEATH_FP: how long it takes, seconds; how
// far back, up and to the side it ends, metres; and the field of view it eases out to). From where your eyes were when
// you went down (DFP), on a smooth ease, so it starts gently, then sweeps out, then settles
const DEATH_FP = { t: 2.4, back: 2.6, up: 2.3, side: 0.9, fov: 60 };
// (abandoning: the rise's share of the pull it takes, up, and how much of the pull goes by before it starts back, wait)
const QUIT_RISE = { up: 0.45, wait: 0.2 };
// (indoors: how far under the ceiling it stops, how far short of a wall, and the least it draws back)
const DEATH_IN = { ceil: 0.3, wall: 0.3, min: 0.4 };
const DFP = { on: false, t: 0, p: new V3(), q: new THREE.Quaternion(), fov: 75, yaw: 0, kc: false, kp: new V3() }, _dfT = new V3(), _dfP = new V3(), _dfM = new THREE.Matrix4(), _dfQ = new THREE.Quaternion();
function fpDeathCam(rdt, c) {
  if (!DFP.on) { DFP.on = true; DFP.t = 0; DFP.p.copy(c.position); DFP.q.copy(c.quaternion); DFP.fov = c.fov; DFP.yaw = VCAM.yaw; DFP.kc = false; }
  DFP.t += rdt; const k = smooth(clamp(DFP.t / DEATH_FP.t, 0, 1)), y = DFP.yaw;
  PM.torso.getWorldPosition(_dfT);
  // in the arena, once you've seen yourself drop, over to whoever did it: behind them from your side, a little above,
  // following them about (KILL_CAM: when it goes, how far back and up, how quick it follows)
  const K = pvpKiller();
  if (K && K.av && DFP.t > KILL_CAM.at) { killCam(rdt, c, K.av.g.position); return; }
  // (behind and above where you were facing, a little off to one side)
  _dfP.set(_dfT.x - Math.sin(y) * DEATH_FP.back + Math.cos(y) * DEATH_FP.side, _dfT.y + DEATH_FP.up, _dfT.z - Math.cos(y) * DEATH_FP.back - Math.sin(y) * DEATH_FP.side);
  // (indoors, under the ceiling and short of the walls: it'd rise through the roof and back through a wall, DEATH_IN)
  const inside = inHouseRect(_dfT.x, _dfT.z, 0);
  if (inside) {
    _dfP.y = Math.min(_dfP.y, CEIL.y - DEATH_IN.ceil);
    const ox = _dfP.x - _dfT.x, oz = _dfP.z - _dfT.z, L = Math.hypot(ox, oz), dx = ox / (L || 1), dz = oz / (L || 1);
    let free = thinRay(_dfT.x, _dfT.z, dx, dz, L); for (let t = 0.2; t < free; t += 0.1) if (bulletBlocked(_dfT.x + dx * t, _dfT.z + dz * t)) { free = t; break; }
    const r = Math.max(DEATH_IN.min, free - DEATH_IN.wall); _dfP.x = _dfT.x + dx * Math.min(L, r); _dfP.z = _dfT.z + dz * Math.min(L, r);
  }
  c.position.lerpVectors(DFP.p, _dfP, k);
  // (an arc rather than a straight pull: it rises a little ahead of drawing back; still on your feet, a run abandoned,
  // it rises well clear of your head and your pack first, QUIT_RISE, and only then draws back over them)
  if (QUIT_CAM.on && !P.dead) { const kb = smooth(clamp((DFP.t / DEATH_FP.t - QUIT_RISE.wait) / (1 - QUIT_RISE.wait), 0, 1)), ku = smooth(clamp(DFP.t / (DEATH_FP.t * QUIT_RISE.up), 0, 1));
    c.position.set(DFP.p.x + (_dfP.x - DFP.p.x) * kb, DFP.p.y + (_dfP.y - DFP.p.y) * ku, DFP.p.z + (_dfP.z - DFP.p.z) * kb); }
  else c.position.y += Math.sin(Math.PI * k) * 0.35;
  if (inside) c.position.y = Math.min(c.position.y, CEIL.y - DEATH_IN.ceil);
  PM.head.visible = c.position.distanceTo(DFP.p) > 0.3;   // (your head, once the view's out of it)
  _dfM.lookAt(c.position, _dfT, _dfV.set(0, 1, 0)); _dfQ.setFromRotationMatrix(_dfM);
  c.quaternion.copy(DFP.q).slerp(_dfQ, smooth(clamp(DFP.t / (DEATH_FP.t * 0.6), 0, 1)));
  const fov = DFP.fov + (DEATH_FP.fov - DFP.fov) * k; if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
}
const _dfV = new V3();
const KILL_CAM = { at: 0.9, back: 3.4, up: 2.2, side: 0.9, follow: 3, fov: 62 }, _kcT = new V3(), _kcW = new V3();
function killCam(rdt, c, g) {
  const dx = _dfT.x - g.x, dz = _dfT.z - g.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  let r = KILL_CAM.back; while (r > 0.9 && !los(g.x, g.z, g.x + ux * r - uz * KILL_CAM.side, g.z + uz * r + ux * KILL_CAM.side)) r -= 0.3;   // (short of a wall behind them)
  _kcW.set(g.x + ux * r - uz * KILL_CAM.side, KILL_CAM.up, g.z + uz * r + ux * KILL_CAM.side); _kcT.set(g.x, 1.2, g.z);
  if (!DFP.kc) { DFP.kc = true; DFP.kp.copy(c.position); }
  const f = 1 - Math.exp(-rdt * KILL_CAM.follow);
  DFP.kp.lerp(_kcW, f); c.position.copy(DFP.kp); PM.head.visible = true;
  _dfM.lookAt(c.position, _kcT, _dfV.set(0, 1, 0)); _dfQ.setFromRotationMatrix(_dfM); c.quaternion.slerp(_dfQ, Math.min(1, f * 1.6));
  const fov = c.fov + (KILL_CAM.fov - c.fov) * f; if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
}
// each frame, from game/camera.js: the view in use, then the camera placed. roll: the springs' tip (a shot, a hit, a
// vault), sh: the shake
// (MELEE_CAM) the swing's tip and pitch, from how fast the weapon's head is going across you and up or down (MS: its fist
// and the way it points, melee/melee-anim.js), and the knock of a blow (fpMeleeHit) ringing out
const _mcT = new V3();
function meleeCam(rdt) {
  const C = MELEE_CAM, D = W(curId()), on = !!D && D.melee && (W8.swing > 0 || !!P.shove);
  _mcT.copy(MS.vF).addScaledVector(MS.vW, 0.6);
  const tr = on ? clamp(-_mcT.x * C.roll, -C.max, C.max) : 0, tp = on ? clamp(_mcT.y * C.pitch, -C.max * 0.5, C.max * 0.5) : 0;
  if (V.mr === undefined) V.mr = V.vmr = V.mp = V.vmp = V.mk = V.vmk = V.mz = V.vmz = 0;
  for (let n = Math.ceil(rdt / (1 / 120)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
    V.vmr += (C.k * (tr - V.mr) - C.d * V.vmr) * h; V.mr += V.vmr * h; V.vmp += (C.k * (tp - V.mp) - C.d * V.vmp) * h; V.mp += V.vmp * h;
    V.vmk += (-C.kz * V.mk - C.dz * V.vmk) * h; V.mk += V.vmk * h; V.vmz += (-C.kz * V.mz - C.dz * V.vmz) * h; V.mz += V.vmz * h;
  }
}
// the flinch (FLINCH): where it's got to and how fast it's going, each way
const FL = { p: 0, y: 0, r: 0, z: 0, vp: 0, vy: 0, vr: 0, vz: 0 };
function flinchStep(rdt) {
  const C = FLINCH;
  for (let n = Math.ceil(rdt / (1 / 120)), h = rdt / Math.max(1, n), i = 0; i < n; i++) for (const a of ['p', 'y', 'r', 'z']) {
    const v = 'v' + a; FL[v] += (-C.k * FL[a] - C.d * FL[v]) * h; FL[a] += FL[v] * h;
  }
}
// hit from (x, z) on the ground (amount: how hard, 1 a zombie's swipe), in first person: the flinch, as hard as the
// screen shake setting lets it (ui/settings.js)
export function fpFlinch(x, z, amount) {
  if (!fpOn() || P.dead) return;
  const C = FLINCH, k = clamp(amount || 1, 0.5, C.max) * SET.shake / 100, [F, Rt] = viewBasis(), rx = x - P.x, rz = z - P.z, L = Math.hypot(rx, rz);
  const fwd = L > 0.05 ? (rx * F.x + rz * F.z) / L : 1, side = L > 0.05 ? (rx * Rt.x + rz * Rt.z) / L : (rand() < 0.5 ? -0.5 : 0.5);
  const j = rr(0.85, 1.15);   // (no two quite alike)
  FL.vp += (fwd >= 0 ? C.pitch * (0.45 + 0.55 * fwd) : -C.behind * -fwd) * k * j;
  FL.vy += side * C.yaw * k * j; FL.vr += side * C.roll * k * rr(0.8, 1.2); FL.vz += C.back * Math.max(0.3, fwd) * k;
}
export function fpMeleeHit(heavy, hard) {
  if (!fpOn()) return;
  const C = MELEE_CAM, k = hard * (heavy ? 1.5 : 1);
  V.vmk = (V.vmk || 0) + C.hitP * k; V.vmz = (V.vmz || 0) + C.hitZ * k * 0.1;
}
// down the sights, once your eye's been placed on them: each shot's turn of the gun (FP_RECOIL.ads) put on the whole of
// what you hold up (your arms and the gun with them), about your eye (at: where it is in the world), so the rear sight
// and the front (or the optic's window and its dot) stay lined up on your eye and the sight picture tips up and aside
// as one and settles back, never one sight swung across the other (turned about the front sight, the rear swung up
// over it on a heavy kick, the LMG's, and you couldn't see through it). Its shove back your eye does ride: shoulderShake
const _ktQ = new THREE.Quaternion(), _ktE = new THREE.Euler(), _ktP = new V3(), _ktT = new V3(), _ktM = new THREE.Matrix4(), _ktM2 = new THREE.Matrix4();
// (the shove's held off softly short of room: your eye never closer to the back of the sights than ADS_CLEAR, metres,
// clear of the view's near plane, so a hard kick down an aperture held close never pushes the rear sight into your eye)
const ADS_CLEAR = 0.06;
function adsKickTilt(at, w, room = Infinity) {
  const C = V.rc, A = FP_RECOIL.ads;
  let push = C.z * FP_RECOIL.adsPush * w; const lim = Math.max(0, room - ADS_CLEAR); if (push > 0) push = lim > 1e-4 ? lim * Math.tanh(push / lim) : 0;
  const p = C.p * A[0] * w, y = C.y * A[1] * w, r = C.r * A[2] * w;
  if (Math.abs(p) + Math.abs(y) + Math.abs(r) + Math.abs(push) < 1e-6) return false;
  const U = PM.upper; U.updateMatrixWorld(true);
  _rq.setFromEuler(_rE.set(armsP(), armsY() + Math.PI, viewR(), 'YXZ'));
  _ktP.copy(at);
  _ktT.set(0, 0, push).applyQuaternion(_rq);   // (and shoved back toward your eye along the view: adsPush)
  _ktQ.copy(_rq).multiply(_vcQ.setFromEuler(_ktE.set(p, y, r, 'YXZ'))).multiply(_vcQ.copy(_rq).invert());
  _ktM.makeTranslation(-_ktP.x, -_ktP.y, -_ktP.z).premultiply(_ktM2.makeRotationFromQuaternion(_ktQ)).premultiply(_ktM2.makeTranslation(_ktP.x + _ktT.x, _ktP.y + _ktT.y, _ktP.z + _ktT.z));
  _ktM.multiply(U.matrixWorld).premultiply(_ktM2.copy(U.parent.matrixWorld).invert());
  _ktM.decompose(U.position, U.quaternion, U.scale); U.updateMatrix(); U.updateMatrixWorld(true);
  return true;
}
// putting a weapon away and drawing the next (player/swap.js), the view goes a little with your hand: a glance and a lean
// toward where the one going away rides as it's put there, then toward where the next one rides as it's drawn, each a
// smooth swell and back (SWAP_CAM, radians: p up, y round, r rolled), only the camera's own turn: your aim stays put
const BAND_LOOK = 0.16;
// and the view goes with the work as the bandage goes on, never held still (BAND_CAM, radians): turned a touch toward the
// arm (yaw) and tipped over to it (roll); a nod each time the strip's pulled tight over the top of a turn (tug, over the
// first tugAt of each turn); a sway after the hand as it goes round (follow, rollT); a slow breath (breath, at
// breathF a second); and the gaze working up the forearm as the wrap goes up it (along). It's all eased (ease: how
// quickly), softer than a weapon swap's, onto it as the arms come up and off it as they go down
const BAND_CAM = { yaw: 0.05, roll: 0.035, tug: 0.024, tugAt: 0.35, follow: 0.012, rollT: 0.014, breath: 0.008, breathF: 1.6, along: 0.03, ease: 4.5, easeOut: 2.6 };
const SWAP_CAM = { side: { p: -0.05, y: -0.035, r: 0.03 }, long: { p: 0.018, y: 0.03, r: -0.035 }, auto: { p: 0.015, y: 0.025, r: -0.03 }, melee: { p: 0.01, y: 0.02, r: -0.025 }, ease: 9 };
function swapCam(rdt) {
  let tp = 0, ty = 0, tr = 0; const s = swapSt;
  if (s && !P.dead) {
    const bell = (a, b) => { const u = clamp((s.t - a) / Math.max(1e-3, b - a), 0, 1), e = Math.sin(Math.PI * u); return e * e; };
    const a = SWAP_CAM[s.from] || null, b = SWAP_CAM[s.to] || null, ka = a ? bell(0, SWAP_T.put + 0.05) : 0, kb = b ? bell(SWAP_T.cross - 0.05, s.end) : 0;
    if (a) { tp += a.p * ka; ty += a.y * ka; tr += a.r * ka; }
    if (b) { tp += b.p * kb; ty += b.y * kb; tr += b.r * kb; }
  }
  const k = Math.min(1, rdt * SWAP_CAM.ease);   // (eased onto, so a swap cut short settles rather than snapping back)
  V.hsp = (V.hsp || 0) + (tp - (V.hsp || 0)) * k; V.hsy = (V.hsy || 0) + (ty - (V.hsy || 0)) * k; V.hsr = (V.hsr || 0) + (tr - (V.hsr || 0)) * k;
  // (and bandaging, the view tips down onto the arm it's going on, BAND_LOOK radians, and goes with the work: BAND_CAM)
  const C = BAND_CAM, bk = P.dead ? 0 : ANIM.bandK || 0; V.bct = (V.bct || 0) + rdt;
  let bp = -BAND_LOOK * bk, by = 0, br = 0;
  if (bk > 0.005) {
    const f = (((ANIM.bandTurn || 0) % 1) + 1) % 1, tug = Math.sin(Math.PI * clamp(f / C.tugAt, 0, 1)) ** 2, wv = Math.sin(2 * Math.PI * f), pr = P.bandT > 0 ? ANIM.bandProg || 0 : 1;
    bp += (-C.tug * tug + C.breath * Math.sin(V.bct * C.breathF * 2 * Math.PI)) * bk;
    by += (C.yaw + C.follow * wv + C.along * (pr - 0.5)) * bk; br += (C.roll + C.rollT * Math.sin(2 * Math.PI * f + 0.6)) * bk;
  }
  const kb = Math.min(1, rdt * (bk > 0.05 ? C.ease : C.easeOut));   // (and slower off it than onto it: the view settles back)
  V.bcp = (V.bcp || 0) + (bp - (V.bcp || 0)) * kb; V.bcy = (V.bcy || 0) + (by - (V.bcy || 0)) * kb; V.bcr = (V.bcr || 0) + (br - (V.bcr || 0)) * kb;
}
export function viewFrame(rdt, roll, sh, jolt) {
  if (state === 'play' || state === 'title') QUIT_CAM.on = false;
  if (!P.dead && !QUIT_CAM.on) DFP.on = false;
  syncView();
  // a menu up (a station's, the cheats', the settings, the pause, the cards): the mouse's own pointer shows over the game
  // round it as well, not only over the menu (body.menuUp, styles/base.css), in either view
  const menu = (state !== 'play' && state !== 'leaving') || P.dead || !!openSt || cheatOn || setOpen() || pvpPicking();   // (the arena's class picker: pvp/pvp.js)
  if (V.menuUp !== menu) { V.menuUp = menu; document.body.classList.toggle('menuUp', menu); }
  if (isoOn()) { EYE_R.on = false; SCOPE_V.on = false; V.sw = 0; sightHide([]); glassSee(false); SPRITE_AIM.w = 0; selfClip(false); return; }
  // (and from your own eyes the mouse is let go for it; while it's free in play, a word that a click takes it back)
  if (menu && locked() && performance.now() - (V.lockAt || 0) > 200) unlock();
  const c = FP_CAM;
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) {
    V.vk += (-FPV.kickK * V.kick - FPV.kickD * V.vk) * dt; V.kick += V.vk * dt;
    V.vky += (-FPV.kickK * V.ky - FPV.kickD * V.vky) * dt; V.ky += V.vky * dt;
    V.vkr = (V.vkr || 0) + (-KICK_FEEL.rollK * (V.kr || 0) - KICK_FEEL.rollD * V.vkr) * dt; V.kr = (V.kr || 0) + V.vkr * dt;
    V.vff = (V.vff || 0) + (-FIRE_FOV.k * (V.ff || 0) - FIRE_FOV.d * (V.vff || 0)) * dt; V.ff = clamp((V.ff || 0) + V.vff * dt, -FIRE_FOV.max, FIRE_FOV.max);
  }
  // (each shot's shudder through the view, dying away: KICK_FEEL)
  V.shp = V.shy = V.shr = 0;
  for (let i = SHUD.length - 1; i >= 0; i--) {
    const h = SHUD[i]; h.t += rdt; const u = h.t / KICK_FEEL.t; if (u >= 1) { SHUD.splice(i, 1); continue; }
    const e = h.a * (1 - u) * (1 - u), tt = h.t * Math.PI * 2;
    V.shp += Math.sin(tt * h.f[0] + h.ph[0]) * e; V.shy += Math.sin(tt * h.f[1] + h.ph[1]) * e * 0.8; V.shr += Math.sin(tt * h.f[2] + h.ph[2]) * e * 1.4;
  }
  // (from a teammate's eyes, the camera's already where theirs is: net/avatars.js, specFp)
  if (specFpOn()) { SCOPE_V.on = false; V.sw = 0; sightHide([]); glassSee(false); SPRITE_AIM.w = 0; selfClip(false); return; }
  if (fpOn() && (P.dead || QUIT_CAM.on)) { fpDeathCam(rdt, c); SCOPE_V.on = false; V.sw = 0; sightHide([]); glassSee(false); SPRITE_AIM.w = 0; selfClip(false); c.updateMatrixWorld(true); return; }
  if (fpOn()) {
    // the eyes: on the head, the way it faces. Your own movement's taken as it comes; the head's sway about you (each
    // step, a lean, a vault) is eased, the bob more than the rest
    fpFreeAim(rdt);   // (the smoothed look's already taken up for the frame: fpLookStep)
    const w0 = adsW(), now = performance.now() / 1000;
    // the springs' tip (a shot, a hit, a vault, a reload's beats), eased; the third-person camera's pushes and zooms as
    // dips, turns and a drawing in; a reload's own sway; the shake as a wobble
    { const e = 1 - Math.exp(-rdt * FP_JOLT.ease), j = jolt || { px: 0, pz: 0, zoom: 0 }, fx = Math.sin(VCAM.yaw), fz = Math.cos(VCAM.yaw), re = clamp(ANIM.relEnv || 0, 0, 1);
      const along = j.px * fx + j.pz * fz, across = j.px * fz - j.pz * fx;
      V.rollS += (roll + FP_JOLT.relR * re * Math.sin(now * 2.1) - V.rollS) * e; V.roll = V.rollS;
      V.jp += (-along * FP_JOLT.push - FP_JOLT.relP * re - V.jp) * e; V.jy += (across * FP_JOLT.push - V.jy) * e; V.jz += (j.zoom * FP_JOLT.zoom - V.jz) * e;
      const a = FP_JOLT.shake * sh; V.np = a * (Math.sin(now * 31) + 0.5 * Math.sin(now * 53 + 1.7)); V.ny = a * (Math.sin(now * 27 + 0.6) + 0.5 * Math.sin(now * 47 + 2.9)); 
      { const rn = rattleAt(), R = FP_RECOIL.rattle; V.np += rn[3] * R.view; V.ny += rn[4] * R.view; } }   // (a gun's rattle buzzing through the view a little)
    // free look, eased out and back
    { const fl = freeLooking(); if (!fl) { V.flyT = 0; V.flpT = 0; } const e = 1 - Math.exp(-rdt * (fl ? FREE_LOOK.ease : FREE_LOOK.back)); V.fly += (V.flyT - V.fly) * e; V.flp += (V.flpT - V.flp) * e; }
    // leaning with how you move: banked into a sidestep, dipped going forward
    { const fx = Math.sin(V.cy), fz = Math.cos(V.cy), fwd = P.vx * fx + P.vz * fz, right = P.vx * -fz + P.vz * fx, d = Math.max(rdt, 1e-3);
      const acc = ((P.vx - V.lvx) * fx + (P.vz - V.lvz) * fz) / d; V.lvx = P.vx; V.lvz = P.vz;
      const m = 1 - TILT.ads * w0, tr = -right * TILT.roll * m, tp = clamp(-fwd * TILT.pitch - clamp(acc, -25, 25) * TILT.acc, -0.04, 0.04) * m;
      for (let n = Math.ceil(rdt / (1 / 120)), h = rdt / Math.max(1, n), i = 0; i < n; i++) { V.vtr += (TILT.k * (tr - V.tr) - TILT.d * V.vtr) * h; V.tr += V.vtr * h; V.vtp += (TILT.k * (tp - V.tp) - TILT.d * V.vtp) * h; V.tp += V.vtp * h; } }
    meleeCam(rdt); flinchStep(rdt);
    // the shots' turn of the gun, ringing out
    recoilStep(rdt);
    // bobbing with your stride
    // (a smooth dip as each foot comes down and rise between them, BOB.foot of it sharpened onto the footfall)
    { const m = clamp(Math.hypot(P.vx, P.vz) / BOB.speed, 0, BOB.max) * (P.moving ? 1 : 0) * (1 - BOB.ads * w0), ph = P.phase || 0;
      V.bobK += (m - V.bobK) * (1 - Math.exp(-rdt * BOB.ease)); const k = V.bobK, f = 2 * ((0.5 - 0.5 * Math.cos(2 * ph)) * (1 - BOB.foot) + Math.abs(Math.sin(ph)) * BOB.foot) - 1.1;
      V.bp = BOB.pitch * k * f; V.br = BOB.roll * k * Math.sin(ph); V.bx = BOB.side * k * Math.sin(ph); V.by = BOB.up * k * f; }
    // over a vault (FP_VAULT): the glance at the sill, the lean, the tip to the side, eased; and the landing off it
    { const v = P.vault, F = FP_VAULT, fire = vaultGun() ? F.fire : 1;
      let tp = 0, tr = 0, tf = 0;
      if (v) {
        const c = v.t > 0 ? 1 : smooth(clamp(v.pre / Math.max(1e-3, v.preDur), 0, 1)), t = Math.min(1, v.t), go = 1 - smooth(clamp((t - F.out[0]) / (F.out[1] - F.out[0]), 0, 1));
        const lean = Math.max(0, PM.g.rotation.x), arc = Math.sin(Math.PI * t);
        tp = -(F.look * c * (1 - smooth(clamp(t / 0.45, 0, 1)) * 0.5) + lean * F.lean) * go * fire;
        tr = (v.fence ? -(v.twistSide || 1) : -(v.side || 0)) * F.roll * arc * fire;
        tf = F.fov * (v.t > 0 ? arc : 0);
      }
      const e = 1 - Math.exp(-rdt * F.ease); V.vp += (tp - V.vp) * e; V.vr += (tr - V.vr) * e; V.vfov += (tf - V.vfov) * e;
      if (V.vaulted && !P.vault) {
        const hv = V.vaultHeavy ? F.heavy : 1, sd = Math.random() < 0.5 ? -1 : 1;
        V.vland -= F.drop * hv; VS.vy -= VM.land * hv; V.vlp -= F.nod * hv; V.vlr += sd * F.rock * hv;
      }
      V.vaulted = !!P.vault; if (v) V.vaultHeavy = !!v.scramble;
      for (let n = Math.ceil(rdt / (1 / 120)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
        V.vland += (-LAND.k * V.land - LAND.d * V.vland) * h; V.land += V.vland * h;
        V.vlp += (-F.k * V.lp - F.d * V.vlp) * h; V.lp += V.vlp * h; V.vlr += (-F.k * V.lr - F.d * V.vlr) * h; V.lr += V.vlr * h;
      } }
    vmStep(rdt, w0, now);
    PM.g.updateMatrixWorld(true); rigStep(rdt);
    // (turning, the view turns about your eye, as in any shooter, not about your middle: the eye's well in front of
    // that, so it used to swing round on an arc, a quarter turn carrying it 20-odd cm, and drift on as the body
    // settled after. Your body's drawn back by as much instead, so the eye stays on where you stand (EYE_PIN: eased off
    // over a vault, whose eye goes with the body)
    { V.pin = (V.pin ?? 1) + ((P.vault ? 0 : 1) - (V.pin ?? 1)) * Math.min(1, rdt * EYE_PIN.ease); const o = EYE_R.o, y = VCAM.yaw, c = Math.cos(y), sn = Math.sin(y), k = V.pin * EYE_PIN.k;
      if (EYE_R.on && k > 0.001) { PM.g.position.x -= (o.x * c + o.z * sn) * k; PM.g.position.z -= (-o.x * sn + o.z * c) * k; PM.g.updateMatrixWorld(true); } }
    rigEye(_vcE);
    // your arms and what's in your hands carried by the view itself, not by your chest (vmLock); let go over a vault, the
    // arms going over with the body, but not with Vault fire, the gun kept on your aim the whole way over in the view
    // (left to the vaulting body it was swung up and round and left trailing it, a moment behind where you look)
    V.vlk = (V.vlk ?? 1) + ((P.vault && !vaultGun() ? 0 : 1) - (V.vlk ?? 1)) * Math.min(1, rdt * 8); vmLock(_vcE, V.vlk); fpCarry(V.vlk);
    V.x = _vcE.x; V.y = _vcE.y; V.z = _vcE.z;
    // down the sights: the gun brought onto this frame's aim (the kick's moved on since it was held), and the eye onto
    // its sight line: at the head's own distance behind it, or a scope's eye relief behind its eyepiece
    const w = adsW(), D = W(curId()), LH = D && !D.melee && !D.akimbo ? sightLine() : null, L = w > 0.001 ? LH : null, gg = gunMeshes[W8.cur];
    const handOptic = !!LH && (D.slot === 'side' || curId() === 'smg') && (LH.kind === 'dot' || LH.kind === 'holo');   // (a handgun's optic, and the machine pistol's on its riser: your eye brought in close behind it, HAND_OPTIC)
    _vcE.set(V.x, V.y, V.z);
    // (the whole upper body turned onto it, not just the gun: straightening the chest for vmLock turned the gun off the
    // aim it was given, and turning only the gun back would pull it out of the hands, which went with the chest)
    if (L && gg) fpSightAlign(PM.upper, false);
    if (LH) { _pa.copy(LH.a).applyMatrix4(LH.obj.matrixWorld); _pb.copy(LH.b).applyMatrix4(LH.obj.matrixWorld); if (slideBack(LH.obj, _slB)) { _pa.sub(_slB); _pb.sub(_slB); } _sd.subVectors(_pb, _pa).normalize(); }
    if (L && gg) {
      if (L.relief !== null) _vcD.copy(_pa).addScaledVector(_sd, -L.relief);
      else if (handOptic) _vcD.copy(_pa).addScaledVector(_sd, -HAND_OPTIC.relief);
      else _vcD.copy(_pa).addScaledVector(_sd, clamp(_vcH.subVectors(_vcE, _pa).dot(_sd), -0.8, -(L.kind === 'holo' || L.kind === 'dot' ? EYE_MIN.optic : D.slot === 'side' ? EYE_MIN.hand : EYE_MIN.iron)));
      // (never further from your head than ADS_EYE_MAX: with the gun not yet up, coming back off a vault or being drawn,
      // its sight line can be well away from your face, and the eye isn't taken out of your head to go to it)
      _vcH.subVectors(_vcD, _vcE); const dl = _vcH.length(); if (dl > ADS_EYE_MAX) _vcD.copy(_vcE).addScaledVector(_vcH, ADS_EYE_MAX / dl);
      _vcE.lerp(_vcD, w);
      // (then the shot's kick tips the gun about your eye, its sights kept lined up on it; the sight line's measured
      // again, so the shots go where the sights now point, the post or the dot)
      if (adsKickTilt(_vcE, w, _vcH.subVectors(_pa, _vcE).dot(_sd) - LH.back)) { _pa.copy(LH.a).applyMatrix4(LH.obj.matrixWorld); _pb.copy(LH.b).applyMatrix4(LH.obj.matrixWorld); if (slideBack(LH.obj, _slB)) { _pa.sub(_slB); _pb.sub(_slB); } _sd.subVectors(_pb, _pa).normalize(); }
      // (and off a bolt coming back, with the gun as the kick's left it: eased back first, the kick's shove took the
      // room that made for itself, measuring its room from the eye)
      boltClear(LH, _vcE, w);
    }
    V.sw = L ? w : 0;
    V.sdW = L ? w : 0; if (L) V.sd.copy(_sd);   // (the sight's own line: where the shots go down the sights, fpAim)
    c.position.set(_vcE.x - Math.cos(V.cy) * V.bx - Math.sin(V.cy) * ((V.mz || 0) + FL.z), _vcE.y + V.by + V.land, _vcE.z + Math.sin(V.cy) * V.bx - Math.cos(V.cy) * ((V.mz || 0) + FL.z));   // (and jolted back off a blow: V.mz, MELEE_CAM)
    swapCam(rdt);
    c.rotation.set(viewP() + V.hsp + (V.bcp || 0), viewY() + V.hsy + (V.bcy || 0) + Math.PI, viewR() + V.hsr + (V.bcr || 0), 'YXZ'); c.updateMatrixWorld(true);
    selfClip(fpOn(), c);
    // a scope's own view (effects/scope-view.js), magnified in its eyepiece, seen through whenever its eyepiece is in
    // view (black but for a sliver with your eye well off its axis, as a real one is); the eye's spring off its axis
    const scope = !!LH && (LH.kind === 'scope' || LH.kind === 'acog');
    { const yr = (VCAM.yaw - (V.lyaw ?? VCAM.yaw)) / Math.max(rdt, 1e-3), pr = (VCAM.pitch - (V.lpitch ?? VCAM.pitch)) / Math.max(rdt, 1e-3); V.lyaw = VCAM.yaw; V.lpitch = VCAM.pitch;
      const tx = clamp(yr * 0.13, -0.55, 0.55), ty = clamp(-pr * 0.13, -0.55, 0.55) + V.kick * 7;
      for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++) { BOX.vx += (-BOX.k * (BOX.x - tx) - BOX.d * BOX.vx) * dt; BOX.x += BOX.vx * dt; BOX.vy += (-BOX.k * (BOX.y - ty) - BOX.d * BOX.vy) * dt; BOX.y += BOX.vy * dt; } }
    // and a holographic sight's reticle, a red dot's dot, an aperture's ghost ring, each where your eye sees it, and the
    // gun a little out of focus down any of them
    const S = SCOPE_V, over = !!LH;
    S.on = over && drawnUp(LH.obj) && (scope || w > 0.3);   // (not with the gun put away for a vault or a station)
    if (S.on) {
      S.kind = LH.kind; S.src = LH.obj; S.eye.copy(_pa); S.obj.copy(_pb); S.dir.copy(_sd); S.r = LH.r; S.hw = LH.hw; S.hh = LH.hh;
      LH.obj.matrixWorld.extractBasis(S.ux, S.uy, _vcH); S.ux.normalize(); S.uy.normalize();
      S.mag = LH.kind === 'acog' ? SCOPE_ACOG : (SCOPES[T('sight')] || SCOPES[3]).mag;
      // where your eye is off its axis, across the view and up it, as a share of how far it can be and still see all of it
      _vcH.subVectors(c.position, _pa); _vcH.addScaledVector(_sd, -_vcH.dot(_sd)); c.matrixWorld.extractBasis(_vcD, _faV, _vcZ);
      S.off.set(_vcH.dot(_vcD) / EYEBOX + BOX.x, _vcH.dot(_faV) / EYEBOX + BOX.y);
      S.a = scope ? 1 : smooth(clamp((w - 0.3) / 0.35, 0, 1)); S.w = w;
    }
    sightHide(L && w > 0.5 ? L.hide : []);
    // particles thinned toward your aim down the sights (effects/sprite-batch.js), round where the crosshair would be
    { const [ox, oy] = fpAimPx(); R.getDrawingBufferSize(_vcS); SPRITE_RES.set(_vcS.x, _vcS.y); SPRITE_AIM.set(0.5 + ox / innerWidth, 0.5 - oy / innerHeight, AIM_THIN.r, AIM_THIN.k * smooth(clamp((w - 0.3) / 0.6, 0, 1))); }
    // in first person every sight's glass is clear to look through (GM.glass, shared, back as it was after)
    glassSee(true);
    // drawn in a little down the sights (a scope's magnified in its own view instead)
    const fov = (SET.fov || 75) * (1 + V.vfov) * (1 - FPV.ads * (ANIM.ads || 0)) * (1 - (handOptic ? HAND_OPTIC.zoom : 0) * (ANIM.ads || 0)) * (1 - 0.04 * smooth(clamp(ANIM.healFx || 0, 0, 1))) * (1 - clamp(V.jz, -0.2, 0.2)) * (1 + FPV.sprint * smooth(clamp(ANIM.sprintK || 0, 0, 1))) * (1 - (V.ff || 0)) * (1 + (WIDE_FOV[T('eyes') || 0] || 0) * (1 - (ANIM.ads || 0)));   // (a touch wider at a sprint, a touch narrower with each shot: FIRE_FOV; wider with Wide eyes, but not down the sights: WIDE_FOV)
    if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  } else {
    SCOPE_V.on = false; V.sw = 0; sightHide([]); glassSee(false); SPRITE_AIM.w = 0;
    // the free camera: flown, easing into and out of its speed
    const s = V.speed * (keys.has('shift') ? FREE.fast : 1), cy = Math.cos(V.fyaw), sy = Math.sin(V.fyaw), cp = Math.cos(V.fpitch), spp = Math.sin(V.fpitch);
    let f = 0, r = 0, u = 0;
    if (keys.has('w') || keys.has('arrowup')) f += 1; if (keys.has('s') || keys.has('arrowdown')) f -= 1;
    if (keys.has('d') || keys.has('arrowright')) r += 1; if (keys.has('a') || keys.has('arrowleft')) r -= 1;
    if (keys.has(' ') || keys.has('e')) u += 1; if (keys.has('control') || keys.has('c') || keys.has('q')) u -= 1;
    _vcD.set(sy * cp * f - cy * r, spp * f + u, cy * cp * f + sy * r); if (_vcD.lengthSq() > 1) _vcD.normalize(); _vcD.multiplyScalar(s);
    const k = 1 - Math.exp(-rdt * FREE.acc); V.vx += (_vcD.x - V.vx) * k; V.vy += (_vcD.y - V.vy) * k; V.vz += (_vcD.z - V.vz) * k;
    V.fx += V.vx * rdt; V.fy = clamp(V.fy + V.vy * rdt, 0.25, FREE.top); V.fz += V.vz * rdt;
    c.position.set(V.fx, V.fy, V.fz); c.rotation.set(V.fpitch, V.fyaw + Math.PI, 0, 'YXZ');
    const fov = SET.fov || 75; if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  }
  c.updateMatrixWorld(true);
}
