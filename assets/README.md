# Source assets

Drop raw asset packs here for Claude to pick from and wire into the game. Nothing in this folder ships with the game
as it is: the site is built from `src/` into `dist/` (`npm run build`), so a pack sitting here costs the players
nothing. Whatever ends up used is copied, trimmed to what's needed, into `src/` when it's wired in.

- `textures/`: texture packs (Kenney zips welcome as they come).
- `sounds/`: sound packs and single sound files.

## How big

- **Per file:** keep each file under **50 MB**. GitHub warns from 50 MB and refuses a push with any file over
  **100 MB**; uploading through the github.com website stops at **25 MB** a file.
- **The whole folder:** keep it under about **200–300 MB**. GitHub wants the repository as a whole under about 1 GB
  (well under 5 GB at most), every clone downloads all of it, and git keeps every version of a file forever, so a
  replaced pack still counts.
- Kenney packs are small (most are 1–30 MB zipped), so a handful of them is fine.
