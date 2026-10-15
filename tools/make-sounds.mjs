// Cuts the game's recorded sounds out of the packs in assets/sounds/ and writes them to src/sounds/.
//
//   node tools/make-sounds.mjs
//
// Needs ffmpeg and unzip on the PATH. Only run it to change which recordings the game uses (or how they're cut): its
// output (src/sounds/*.ogg) is committed, so a normal build doesn't need either tool. Each sound is cut to its
// [from, to] window (ms into the recording), the silence before it starts is trimmed off so it plays the instant it's
// triggered, rumble below 35 Hz is filtered out, the tail is faded out where it dies away, and it's peak-normalised
// to -3 dBFS (Vorbis overshoots it a little). How loud each one plays in the game is set in src/js/audio/samples.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(ROOT, 'assets/sounds/Guns and stuffs.zip'), IN = 'Gunshots and stuff/Sounds/';
const OUT = path.join(ROOT, 'src/sounds');
const SR = 44100;

// gunshots get a touch more weight and a gentle compressor to even out their bodies
const GUN = 'equalizer=f=110:t=q:w=1:g=2,acompressor=threshold=0.18:ratio=2.2:attack=6:release=140:makeup=1.2';
// output name: [file in the pack, { from, to (ms), fx (an extra ffmpeg filter), tail (dB under the peak where it ends) }]
const SOUNDS = {
  // one recording per gun: the game varies each shot itself (pitch, speed, tone)
  shot_pistol: ['Guns/Fire/pistol_fire_ufx_2.ogg', { fx: GUN }],
  shot_revolver: ['Guns/Fire/revolver_fire_ufx_1.ogg', { fx: GUN }],
  shot_deagle: ['Guns/Fire/old_revolver_fire_ufx_1.ogg', { fx: GUN }],
  shot_pump: ['Guns/Fire/shotgun_fire_ufx_2.ogg', { fx: GUN, to: 1300 }],
  shot_dbl: ['Guns/Fire/shotgun_fire_ufx_1.ogg', { fx: GUN, to: 840 }],
  shot_auto12: ['Guns/Fire/old_shotgun_fire_ufx_1.ogg', { fx: GUN, to: 560 }],
  shot_hunting: ['Guns/Fire/old_rifle_fire_ufx_3.ogg', { fx: GUN }],
  shot_smg: ['Guns/Fire/smg_fire_ufx_1.ogg', { fx: GUN }],
  shot_sub: ['Guns/Fire/smg_fire_ufx_3.ogg', { fx: GUN }],
  shot_ar: ['Guns/Fire/assault_rifle_fire_ufx_2.ogg', { fx: GUN }],
  shot_lmg: ['Guns/Fire/machinegun_heavy_fire_ufx_1.ogg', { fx: GUN, to: 760 }],
  shot_gl: ['Guns/Fire/grenade_launcher_fire_ufx_3.ogg', { fx: GUN }],
  supp_pistol: ['Guns/Fire/pistol_fire_suppressed_ufx_1.ogg', {}],
  supp_smg: ['Guns/Fire/smg_fire_suppressed_ufx_2.ogg', {}],
  supp_rifle: ['Guns/Fire/assault_rifle_fire_suppressed_ufx_2.ogg', {}],
  supp_sniper: ['Guns/Fire/sniper_rifle_fire_suppressed_ufx_1.ogg', {}],
  supp_shotgun: ['Guns/Fire/shotgun_fire_suppressed_ufx_1.ogg', {}],
  // pulling the trigger on an empty gun
  dry_pistol: ['Guns/Misc/pistol_universal_empty_barrel_ufx_1.ogg', {}],
  dry_smg: ['Guns/Misc/smg_universal_empty_barrel_ufx_1.ogg', {}],
  dry_rifle: ['Guns/Misc/rifle_universal_empty_barrel_ufx_1.ogg', {}],
  // reloading
  magout_pistol: ['Guns/Reloading/pistol_reloading_mag_out_ufx_1.ogg', {}],
  magout_smg: ['Guns/Reloading/smg_reloading_mag_out_ufx_2.ogg', {}],
  magout_rifle: ['Guns/Reloading/assault_rifle_reloading_mag_out_ufx_1.ogg', {}],
  magin_pistol: ['Guns/Reloading/pistol_reloading_mag_in_ufx_1.ogg', {}],
  magin_smg: ['Guns/Reloading/smg_reloading_mag_in_ufx_1.ogg', {}],
  magin_rifle: ['Guns/Reloading/assault_rifle_reloading_mag_in_ufx_2.ogg', {}],
  shell_1: ['Guns/Reloading/shotgun_reloading_slug_in_ufx_1.ogg', {}],
  shell_2: ['Guns/Reloading/shotgun_reloading_slug_in_ufx_2.ogg', {}],
  round_in: ['Guns/Reloading/sniper_rifle_reloading_round_in_ufx_1.ogg', {}],
  // racking recordings split at the slam, so the pull and the release land on the animation's own beats
  charge_pull_rifle: ['Guns/Racking/assault_rifle_racking_ufx_1.ogg', { to: 270 }],
  charge_slam_rifle: ['Guns/Racking/assault_rifle_racking_ufx_1.ogg', { from: 270 }],
  charge_pull_smg: ['Guns/Racking/smg_racking_ufx_1.ogg', { to: 350 }],
  charge_slam_smg: ['Guns/Racking/smg_racking_ufx_1.ogg', { from: 350 }],
  slide_pull: ['Guns/Racking/pistol_racking_ufx_4.ogg', { to: 250 }],
  slide_drop: ['Guns/Racking/pistol_racking_ufx_4.ogg', { from: 250 }],
  pump_back: ['Guns/Racking/shotgun_racking_ufx_4.ogg', { to: 300 }],
  pump_home: ['Guns/Racking/shotgun_racking_ufx_4.ogg', { from: 300 }],
  pump_back_2: ['Guns/Racking/shotgun_racking_ufx_2.ogg', { to: 365 }],
  pump_home_2: ['Guns/Racking/shotgun_racking_ufx_2.ogg', { from: 365 }],
  safety_1: ['Guns/Misc/firearm_universal_safety_switch_ufx_1.ogg', {}],
  safety_2: ['Guns/Misc/firearm_universal_safety_switch_ufx_2.ogg', {}],
  // a mag hitting the floor: just the first knock of a dropped gun; and the whole gun, dropped
  mag_drop: ['Guns/Drop/firearm_drop_ufx_4.ogg', { from: 30, to: 135 }],
  gun_drop: ['Guns/Drop/firearm_drop_ufx_3.ogg', {}],
  // explosions
  boom_close: ['Explosions/explosion_close_short_ufx_3.ogg', { to: 2000 }],
  boom_far: ['Explosions/explosion_distant_short_ufx_1.ogg', {}],
  // melee
  swing_light_1: ['Melee weapons/Swing/universal_swing_miss_light_ufx_1.ogg', {}],
  swing_light_2: ['Melee weapons/Swing/universal_swing_miss_light_ufx_2.ogg', {}],
  swing_heavy_1: ['Melee weapons/Swing/universal_swing_miss_heavy_ufx_1.ogg', {}],
  swing_heavy_2: ['Melee weapons/Swing/universal_swing_miss_heavy_ufx_2.ogg', {}],
  swing_heavy_3: ['Melee weapons/Swing/universal_swing_miss_heavy_ufx_3.ogg', {}],
  swing_knife: ['Melee weapons/Swing/knife_swing_miss_ufx_1.ogg', {}],
  draw_blade: ['Melee weapons/Draw/sword_draw_ufx_2.ogg', {}],
  draw_knife: ['Melee weapons/Draw/knife_draw_ufx_1.ogg', {}],
  hit_blunt_1: ['Melee weapons/Hit/blunt_hit_bloody_moderate_ufx_1.ogg', { to: 350 }],
  hit_blunt_2: ['Melee weapons/Hit/blunt_hit_bloody_light_ufx_1.ogg', { to: 500 }],
  hit_blunt_big_1: ['Melee weapons/Hit/blunt_hit_bloody_heavy_ufx_1.ogg', { to: 510 }],
  hit_blunt_big_2: ['Melee weapons/Hit/blunt_hit_heavy_ufx_1.ogg', {}],
  hit_blade_1: ['Melee weapons/Hit/sharp_slash_body_ufx_1.ogg', {}],
  hit_blade_2: ['Melee weapons/Hit/sharp_critical_hit_body_ufx_1.ogg', {}],
  hit_chop_1: ['Melee weapons/Hit/slash_bloody_heavy_ufx_1.ogg', { to: 610 }],
  hit_chop_2: ['Melee weapons/Hit/slash_bloody_heavy_ufx_3.ogg', { to: 530 }],
  // bullets into zombies, and what comes off them
  flesh_1: ['Impact & Break/Body/impact_body_ufx_1.ogg', {}],
  flesh_2: ['Impact & Break/Body/impact_body_ufx_2.ogg', {}],
  head_hit: ['Melee weapons/Hit/sharp_critical_hit_body_ufx_2.ogg', {}],
  kill_1: ['Melee weapons/Hit/sticky_hit_body_ufx_1.ogg', { to: 470 }],
  kill_2: ['Melee weapons/Hit/sticky_hit_body_ufx_2.ogg', { to: 520 }],
  sever: ['Melee weapons/Hit/slash_bloody_heavy_ufx_2.ogg', { to: 490 }],
  head_pop: ['Melee weapons/Hit/blunt_hit_bloody_heavy_ufx_1.ogg', { to: 510 }],
  // barricades, crates and kit
  wood_hit_1: ['Impact & Break/Wood/impact_wood_ufx_1.ogg', {}],
  wood_hit_2: ['Impact & Break/Wood/impact_wood_ufx_2.ogg', {}],
  wood_break: ['Impact & Break/Wood/break_wood_ufx_1.ogg', {}],
  craft: ['Misc/item_craft_ufx_1.ogg', {}],
  pickup: ['Misc/item_pickup_ufx_1.ogg', { from: 200 }],
  equip: ['Misc/item_equip_ufx_1.ogg', {}],
  upgrade: ['Misc/item_upgrade_ufx_1.ogg', {}],
  crate_open: ['Misc/wooden_container_open_large_ufx_1.ogg', {}],
  medkit: ['Misc/medkit_use_ufx_1.ogg', {}]
};

function decode(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}
function filter(file, fx) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', file, '-af', fx, '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}
// x: interleaved stereo. Trims, fades and normalises it
function shape(x, o) {
  const n = x.length / 2, ms = v => Math.round(v * SR / 1000);
  let a = Math.min(n, ms(o.from || 0)), b = Math.min(n, o.to ? ms(o.to) : n);
  const amp = i => Math.max(Math.abs(x[i * 2]), Math.abs(x[i * 2 + 1]));
  let pk = 0; for (let i = a; i < b; i++) pk = Math.max(pk, amp(i));
  // the start: 3 ms before it first rises within 36 dB of its peak
  const on = pk * Math.pow(10, -36 / 20); let s = a; while (s < b && amp(s) < on) s++; a = Math.max(a, s - ms(3));
  // the end: where it last falls below the tail threshold (in 10 ms windows), plus a little
  const off = pk * Math.pow(10, -(o.tail || 54) / 20), w = ms(10); let e = b;
  while (e - w > a) { let m = 0; for (let i = e - w; i < e; i++) m = Math.max(m, amp(i)); if (m >= off) break; e -= w; }
  b = Math.min(b, e + ms(20));
  const len = b - a, out = new Float32Array(len * 2), fin = Math.min(ms(1.5), len), fout = Math.min(len, Math.max(ms(25), Math.min(ms(160), Math.round(len * 0.3))));
  const cut = !!o.to && o.to * SR / 1000 <= b + 1;   // cut short: fade the last part harder
  for (let i = 0; i < len; i++) {
    let g = 1;
    if (o.from && i < fin) g *= i / fin;
    const r = len - i; if (r < fout) { const k = r / fout; g *= cut ? k * k : k; }
    out[i * 2] = x[(a + i) * 2] * g; out[i * 2 + 1] = x[(a + i) * 2 + 1] * g;
  }
  let p2 = 0; for (const v of out) p2 = Math.max(p2, Math.abs(v));
  const norm = Math.pow(10, -3 / 20) / (p2 || 1); for (let i = 0; i < out.length; i++) out[i] *= norm;
  return out;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-sounds-'));
try {
  execFileSync('unzip', ['-q', '-o', PACK, '-d', tmp]);
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.ogg')) fs.unlinkSync(path.join(OUT, f));
  let total = 0;
  for (const [name, [src, o]] of Object.entries(SOUNDS)) {
    let x = decode(path.join(tmp, IN, src));
    const pre = path.join(tmp, name + '.f32');
    fs.writeFileSync(pre, Buffer.from(x.buffer, x.byteOffset, x.byteLength));
    x = filter(pre, 'highpass=f=35' + (o.fx ? ',' + o.fx : ''));
    const y = shape(x, o), mid = path.join(tmp, name + '.out.f32'), dst = path.join(OUT, name + '.ogg');
    fs.writeFileSync(mid, Buffer.from(y.buffer, y.byteOffset, y.byteLength));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', mid, '-c:a', 'libvorbis', '-q:a', '4', '-map_metadata', '-1', dst]);
    total += fs.statSync(dst).size;
    console.log(`${name.padEnd(20)} ${(y.length / 2 / SR * 1000).toFixed(0).padStart(5)} ms  ${src}`);
  }
  console.log(`${Object.keys(SOUNDS).length} sounds, ${(total / 1024).toFixed(0)} KB, in src/sounds/`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
