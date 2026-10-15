# Sounds

Put sound packs here: Kenney zips as they come (for example `kenney_impact-sounds.zip`), or loose OGG/WAV/MP3 files.
Say which sounds are for what (gunshots, footsteps, zombie groans, wood breaking...) if you have something in mind;
otherwise Claude will pick what fits. The game's sounds are synthesized now (`src/js/audio/sfx.js`); a recorded one
replaces its synthesized one when it's wired in, and only the files that get used are copied into the game (`src/`).
