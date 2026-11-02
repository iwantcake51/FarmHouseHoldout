#!/usr/bin/env python3
# Packs the ground textures (and the rocks' and hay bales') out of the SBS Tiny Texture Packs in assets/textures (the .rar files, read as they come with
# bsdtar or unar) into src/js/world/ground-art.js: each one graded part of the way toward the farm's muted colours (so
# the ground keeps the look it had, with the packs' detail in it), as a JPEG in a data: URL (GROUND_ART, drawn by the
# ground's and the rocks' shaders in world/ground.js). And the floors' textures (FLOOR: the arena maps' concrete,
# asphalt, tiles, carpet, dirt and straw, the farmhouse's boards), graded all the way to a mid grey and stacked into
# one strip (GROUND_ART.floors, its layers in FLOOR_LAYERS: world/floors.js lays them over each floor in the world).
# Run it again after changing PICK or FLOOR:  python3 tools/pack-ground.py
import base64, io, math, os, shutil, subprocess
from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = {1: 'SBS - Tiny Texture Pack - 128x128.rar', 2: 'SBS - Tiny Texture Pack 2 - 128x128.rar', 3: 'SBS - Tiny Texture Pack 3 - Small.rar'}
# key: (pack, file, the colour it's graded toward, and how far: GRADE unless it says)
PICK = {
    # the grass, four kinds the shader fades in and out of each other: thick, patchy, thin over bare earth, dry
    'grass': (1, '128x128/Grass/Grass_19-128x128.png', (78, 80, 52)),
    'patchy': (1, '128x128/Grass/Grass_03-128x128.png', (82, 82, 52)),
    'thin': (1, '128x128/Grass/Grass_18-128x128.png', (96, 94, 62)),
    'dry': (1, '128x128/Grass/Grass_11-128x128.png', (112, 100, 70)),
    # bare earth: the trodden yard and paths, and the drive's brown dirt
    'earth': (2, '128x128/Dirt/Dirt_16-128x128.png', (100, 88, 66)),
    'drive': (2, '128x128/Dirt/Dirt_01-128x128.png', (112, 92, 66)),
    # the rocks and stones round the map (world/trees.js, textured by rockMat in world/ground.js): rough grey stone and a speckled granite, graded all the way to
    # a mid grey so they only add their grain to each rock's own colour and moss
    'rock': (3, '128x128/Stone/Stone_05-128x128.png', (128, 128, 128), 1),
    'rock2': (2, '128x128/Stone/Stone_09-128x128.png', (128, 128, 128), 1),
    # the round hay bales (world/props.js): a straw thatch, turned so its strands run round the bale, graded to the bales'
    # straw colour; its ends (hayEnd) are made from it too, rolled up into a spiral (spiral)
    'hay': (1, '128x128/Roofs/Roofs_13-128x128.png', (170, 146, 82), 0.9),
}
# turned a quarter (so the strands run along u, round the bale), and how much of the contrast each keeps
TURN = {'hay'}
SOFT = {'hay': 0.65}
# the flat end of a round bale, made from another texture: the straw wound round into a spiral, the coils' edges
# darker (SPIRAL: its size, how many coils, how dark between them)
SPIRAL = {'hayEnd': ('hay', 256, 8, 0.3)}


def spiral(src, size, coils, dark):
    w, h = src.size
    px = src.load()
    out = Image.new('RGB', (size, size))
    op = out.load()
    for y in range(size):
        for x in range(size):
            dx, dy = (x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1
            r, a = math.hypot(dx, dy), math.atan2(dy, dx) / (2 * math.pi) % 1
            # across the strands as it winds out, along them round it (in the turned texture the strands run along x)
            c = px[int(a * w * 3) % w, int(r * h * 1.5) % h]
            k = 1 - dark * (0.5 - 0.5 * math.cos(2 * math.pi * (r * coils - a)))
            k *= 1 - 0.25 * max(0.0, r - 0.9) / 0.1   # the rim a touch darker
            op[x, y] = tuple(min(255, round(v * k)) for v in c)
    return out
# how far toward its colour each is graded (0 as it comes, 1 all the way)
GRADE = 0.75
# the floors (world/floors.js FLOOR_KIND says which goes where, at what size): each made grey and brought to a mid grey
# on average, so it brings only its own grain, joints and grout (its light and dark) to a floor whose colours (and
# paint, stains and markings) stay its map's; kept at the packs' 128 pixels (the GPU's mipmaps and filtering soften them, and a finer copy of each laid over
# it close up keeps them crisp: FLOOR_FS)
FLOOR = {
    'concrete': (2, '128x128/Plaster/Plaster_19-128x128.png'),   # poured concrete, fine aggregate in it
    'asphalt': (2, '128x128/Dirt/Dirt_15-128x128.png'),          # coarse dark grit
    'terrazzo': (1, '128x128/Tile/Tile_12-128x128.png'),         # big square tiles, a dark diamond set at their corners
    'checker': (2, '128x128/Tile/Tile_04-128x128.png'),          # granite squares, dark and light
    'granite': (2, '128x128/Tile/Tile_16-128x128.png'),          # small speckled tiles, three by three, grouted
    'carpet': (3, '128x128/Cloth/Cloth_17-128x128.png'),         # a fine twill weave
    'gravel': (2, '128x128/Dirt/Dirt_17-128x128.png'),           # packed dirt with grit and small stones
    'soil': (3, '128x128/Terrain/Terrain_21-128x128.png'),       # turned earth, clods
    'straw': (1, '128x128/Roofs/Roofs_13-128x128.png'),          # loose straw
    'boards': (1, '128x128/Wood/Wood_06-128x128.png'),           # floorboards, four across, their joints staggered
}
FLOOR_GREY = 128   # (what each floor averages: world/floors.js doubles it back to 1)


def read(pack, name):
    rar = os.path.join(ROOT, 'assets', 'textures', PACKS[pack])
    if shutil.which('bsdtar'):
        return subprocess.run(['bsdtar', '-xOf', rar, name], check=True, capture_output=True).stdout
    return subprocess.run(['unar', '-q', '-o', '-', rar, name], check=True, capture_output=True).stdout


def pack():
    out, total = [], 0
    made = {}
    for key, (pk, name, want, *grade) in PICK.items():
        im = Image.open(io.BytesIO(read(pk, name))).convert('RGB')
        if key in TURN: im = im.transpose(Image.Transpose.ROTATE_90)
        mean = ImageStat.Stat(im).mean
        gain = [(w / max(m, 1)) ** (grade[0] if grade else GRADE) for w, m in zip(want, mean)]
        im = Image.merge('RGB', [b.point(lambda v, g=g: min(255, round(v * g))) for b, g in zip(im.split(), gain)])
        if key in SOFT: im = Image.blend(Image.new('RGB', im.size, tuple(round(v) for v in ImageStat.Stat(im).mean)), im, SOFT[key])
        made[key] = im
    for key, (src, *opts) in SPIRAL.items():
        size, *rest = opts   # (drawn at twice the size and brought down, so the fine strands at its middle don't alias)
        made[key] = spiral(made[src].resize((512, 512), Image.LANCZOS), size * 2, *rest).resize((size, size), Image.LANCZOS)
    for key, im in made.items():
        buf = io.BytesIO(); im.save(buf, 'JPEG', quality=90, optimize=True)
        total += buf.tell()
        out.append(f"  {key}: 'data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}'")
    # the floors, one strip of them (a layer each, top to bottom)
    strip = Image.new('L', (128, 128 * len(FLOOR)))
    for n, (key, (pk, name)) in enumerate(FLOOR.items()):
        im = Image.open(io.BytesIO(read(pk, name))).convert('L')
        gain = FLOOR_GREY / max(ImageStat.Stat(im).mean[0], 1)
        strip.paste(im.point(lambda v: min(255, round(v * gain))), (0, 128 * n))
    buf = io.BytesIO(); strip.save(buf, 'JPEG', quality=92, optimize=True)
    total += buf.tell()
    out.append(f"  floors: 'data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}'")
    js = ('// Generated by tools/pack-ground.py from the SBS Tiny Texture Packs in assets/textures. Don\'t edit by hand.\n\n'
          'export const GROUND_ART = {\n' + ',\n'.join(out) + '\n};\n'
          'export const FLOOR_LAYERS = ' + repr(list(FLOOR)).replace("'", '"') + ';\n')
    with open(os.path.join(ROOT, 'src', 'js', 'world', 'ground-art.js'), 'w') as f:
        f.write(js)
    print(f'{len(out) - 1} textures and {len(FLOOR)} floors, {total // 1024} KB')


if __name__ == '__main__':
    pack()
