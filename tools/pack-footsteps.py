#!/usr/bin/env python3
"""Packs the footstep recordings in assets/sounds/Footsteps.zip into one small sound sprite for the game.

    python3 tools/pack-footsteps.py

Needs ffmpeg and numpy. Each clip is cut to the step itself (the silence before it trimmed, the tail faded out), brought
to the same loudness as the rest of its set, and laid end to end with a gap of silence between them in
src/sounds/footsteps.mp3. Where each one starts and how long it runs goes in src/js/audio/footstep-sprite.js, which the
game reads (audio/footsteps.js). Run it again after changing the sets below or the zip.
"""
import os, re, json, shutil, subprocess, tempfile, zipfile
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP = os.path.join(ROOT, 'assets/sounds/Footsteps.zip')
OUT_MP3 = os.path.join(ROOT, 'src/sounds/footsteps.mp3')
OUT_JS = os.path.join(ROOT, 'src/js/audio/footstep-sprite.js')
SR = 44100
GAP = 0.12        # seconds of silence between clips, so a clip never runs into the next one
MAX_LEN = 0.55    # longest a clip is kept, faded out over its last FADE
FADE = 0.06
TARGET = 10 ** (-14 / 20)   # every clip's loudest 20 ms brought to this level (RMS), so a set sounds even

# surface.kind -> (folder in the pack, file name pattern, how many to keep). The farm has three grounds: the house's
# floorboards and the porch (wood), the dirt drive and the trodden yard round the house (dirt), and the grass
SETS = {
    'wood.walk': ('Footsteps_Wood/Footsteps_Wood_Walk', r'Walk', 10),
    'wood.run': ('Footsteps_Wood/Footsteps_Wood_Run', r'Run', 10),
    'wood.land': ('Footsteps_Wood/Footsteps_Wood_Jump', r'Land', 4),
    'wood.jump': ('Footsteps_Wood/Footsteps_Wood_Jump', r'Start', 4),
    'grass.walk': ('Footsteps_Grass/Footsteps_Grass_Walk', r'Walk', 12),
    'grass.run': ('Footsteps_Grass/Footsteps_Grass_Run', r'Run', 12),
    'grass.land': ('Footsteps_Grass/Footsteps_Grass_Jump', r'Land', 5),
    'grass.jump': ('Footsteps_Grass/Footsteps_Grass_Jump', r'Start', 4),
    'dirt.walk': ('Footsteps_DirtyGround/Footsteps_DirtyGround_Walk', r'Walk', 10),
    'dirt.run': ('Footsteps_DirtyGround/Footsteps_DirtyGround_Run', r'Run', 10),
    'dirt.land': ('Footsteps_DirtyGround/Footsteps_DirtyGround_Land', r'Land', 3),
    'dirt.jump': ('Footsteps_DirtyGround/Footsteps_DirtyGround_Land', r'Start', 3),
}


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def envelope(x, win):
    k = max(1, int(win * SR))
    return np.sqrt(np.convolve(x * x, np.ones(k) / k, mode='same'))


def tidy(x):
    env = envelope(x, 0.005)
    loud = np.nonzero(env > env.max() * 10 ** (-40 / 20))[0]
    a = max(0, loud[0] - int(0.004 * SR))                      # 4 ms before the step comes in
    b = min(len(x), loud[-1] + int(0.02 * SR), a + int(MAX_LEN * SR))
    x = x[a:b].copy()
    f = min(len(x), int(FADE * SR)); x[-f:] *= np.linspace(1, 0, f) ** 2
    x[:16] *= np.linspace(0, 1, 16)                             # no click at the start
    return x * (TARGET / max(1e-6, envelope(x, 0.02).max()))


def main():
    tmp = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(ZIP) as z: z.extractall(tmp)
        base = next(os.path.join(tmp, d) for d in os.listdir(tmp) if os.path.isdir(os.path.join(tmp, d)))
        out, sprite, t = [], {}, 0.0
        for key, (folder, pat, n) in SETS.items():
            names = sorted(f for f in os.listdir(os.path.join(base, folder)) if f.endswith('.wav') and re.search(pat, f))[:n]
            sprite[key] = []
            for f in names:
                x = tidy(load(os.path.join(base, folder, f)))
                sprite[key].append([round(t, 4), round(len(x) / SR, 4)])
                out += [x, np.zeros(int(GAP * SR), np.float32)]; t += len(x) / SR + GAP
        pcm = np.clip(np.concatenate(out), -1, 1).astype(np.float32)
        os.makedirs(os.path.dirname(OUT_MP3), exist_ok=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '64k', OUT_MP3], input=pcm.tobytes(), check=True)
        with open(OUT_JS, 'w') as fh:
            fh.write('// Where each footstep sits in src/sounds/footsteps.mp3: surface.kind -> [start, length] in seconds. Written by\n')
            fh.write('// tools/pack-footsteps.py from assets/sounds/Footsteps.zip; run that again rather than editing this by hand.\n\n')
            fh.write('const FOOT_SPRITE = {\n')
            for key, clips in sprite.items(): fh.write(f"  '{key}': {json.dumps(clips, separators=(',', ':'))},\n")
            fh.write('};\n')
        print(f'{sum(len(v) for v in sprite.values())} clips, {t:.1f} s, {os.path.getsize(OUT_MP3) / 1024:.0f} KB -> {os.path.relpath(OUT_MP3, ROOT)}')
    finally:
        shutil.rmtree(tmp)


if __name__ == '__main__':
    main()
