# Sounds

Put sound packs here: Kenney zips as they come (for example `kenney_impact-sounds.zip`), or loose OGG/WAV/MP3 files.
Say which sounds are for what (gunshots, footsteps, zombie groans, wood breaking...) if you have something in mind;
otherwise Claude will pick what fits. `tools/make-sounds.mjs` picks the recordings the game uses out of these packs, cuts and levels them, and writes them
to `src/sounds/`; anything not wired in yet is still synthesized (`src/js/audio/sfx.js`).
