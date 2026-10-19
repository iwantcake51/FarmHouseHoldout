#!/usr/bin/env python3
# Packs the particle sprites the game uses out of the Kenney packs in assets/textures (the Particle Pack and Light
# Masks zips, read as they come) into src/js/effects/particle-art.js: each one cut down to the size it's drawn at, as a
# grey + alpha PNG in a data: URL (PART_ART, loaded by partTex in effects/textures.js). Run it again after changing
# PICK:  python3 tools/pack-particles.py
import base64, io, os, zipfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = {'p': ('kenney_particle-pack.zip', 'PNG (Transparent)/'), 'm': ('kenney_light-masks-1.0 (1).zip', 'Transparent/')}
# key: (pack, file, size, turn) — turn: degrees counter-clockwise, so a streak drawn up and down lies along x
PICK = {
    # smoke and dust: soft billows in a few shapes, so no two puffs look alike
    **{f'smoke{n}': ('p', f'smoke_0{n}.png', 128, 0) for n in range(1, 9)},
    'smokeRing': ('p', 'smoke_10.png', 128, 0),
    # debris thrown off a hit: a spray of grit and chips (tinted red, a spray of blood)
    **{f'dirt{n}': ('p', f'dirt_0{n}.png', 128, 0) for n in range(1, 4)},
    # flames licking up off something burning, and a rolling fireball
    **{f'flame{n}': ('p', f'flame_0{n}.png', 128, 0) for n in range(1, 7)},
    'fire1': ('p', 'fire_01.png', 128, 0), 'fire2': ('p', 'fire_02.png', 128, 0),
    # the muzzle flash seen from the side (tongues out of the barrel, base at the bottom) and head on
    **{f'muzzle{n}': ('p', f'muzzle_0{n}.png', 128, 0) for n in range(1, 6)},
    'star6': ('p', 'star_06.png', 128, 0), 'star7': ('p', 'star_07.png', 128, 0), 'star8': ('p', 'star_08.png', 128, 0), 'star9': ('p', 'star_09.png', 128, 0),
    # a bright burst where a round strikes, and a blast's core
    'burst1': ('p', 'scorch_01.png', 128, 0), 'burst2': ('p', 'scorch_02.png', 128, 0), 'burst3': ('p', 'scorch_03.png', 128, 0),
    # sparks and burning pellets: thin streaks laid along x, so a sprite turned to its motion draws out along it
    'trace1': ('p', 'trace_01.png', 128, 90), 'trace2': ('p', 'trace_02.png', 128, 90), 'trace6': ('p', 'trace_06.png', 128, 90), 'trace7': ('p', 'trace_07.png', 128, 90),
    # a glowing point (embers, a tracer's head) and soft round glows
    'dot': ('p', 'circle_05.png', 64, 0), 'glint': ('p', 'flare_01.png', 64, 0),
    'glow': ('m', 'shape_b.png', 128, 0), 'glowSoft': ('m', 'shape_a.png', 128, 0), 'glowNoise': ('m', 'shape_c.png', 128, 0),
    # a blast's shock ring along the ground
    'ring': ('m', 'ring_b_noise.png', 128, 0),
}


def pack():
    zips = {k: zipfile.ZipFile(os.path.join(ROOT, 'assets', 'textures', z)) for k, (z, _) in PACKS.items()}
    names = {k: zips[k].namelist() for k in zips}
    out, total = [], 0
    for key, (pk, f, size, turn) in PICK.items():
        path = next(n for n in names[pk] if n.endswith(PACKS[pk][1] + f))
        im = Image.open(io.BytesIO(zips[pk].read(path))).convert('RGBA')
        if turn: im = im.rotate(turn, expand=True)
        im = im.resize((size, size), Image.LANCZOS)
        # grey + alpha is all any of them carry (the packs are white or grey shapes)
        r, g, b, a = im.split(); la = Image.merge('LA', (Image.merge('RGB', (r, g, b)).convert('L'), a))
        buf = io.BytesIO(); la.save(buf, 'PNG', optimize=True); data = base64.b64encode(buf.getvalue()).decode()
        total += len(data); out.append(f"  {key}: 'data:image/png;base64,{data}'")
    js = ('// Particle sprites from the Kenney Particle Pack and Light Masks (CC0, kenney.nl), packed by\n'
          '// tools/pack-particles.py: grey + alpha PNGs, loaded as textures by partTex (effects/textures.js). Generated: do not edit.\n'
          'const PART_ART = {\n' + ',\n'.join(out) + '\n};\n')
    with open(os.path.join(ROOT, 'src', 'js', 'effects', 'particle-art.js'), 'w') as fh: fh.write(js)
    print(f'{len(out)} sprites, {total // 1024} KB')


if __name__ == '__main__':
    pack()
