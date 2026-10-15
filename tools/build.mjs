// Builds the game into dist/ (and a single-file dist/standalone.html).
//
//   node tools/build.mjs           production build: one minified game.js + game.css
//   node tools/build.mjs --dev     readable build with file banners, for debugging
//   node tools/build.mjs --serve   dev build + local server on http://localhost:5173, rebuilds on every save
//
// The game is plain browser JavaScript split across src/js/<system>/*.js. All files share one scope:
// they are joined in the order listed in src/js/load-order.json and wrapped in a single function.
// That means any file can call a function from any other file, and load order only matters for
// top-level statements that run immediately (building the world, creating materials, and so on).
import { build as esbuild, transform } from 'esbuild';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src'), OUT = path.join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));
const serve = args.has('--serve'), dev = serve || args.has('--dev');
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
// the F9 cheat menu (src/js/ui/cheats.js) is for testing: Netlify's production deploy of main is built with CHEATS=off
// (netlify.toml), which leaves it out of the game altogether, its panel and all. Deploy previews, branch deploys and
// local builds keep it
const cheats = process.env.CHEATS ? process.env.CHEATS !== 'off' : process.env.CONTEXT !== 'production';
// what stands in for ui/cheats.js without it: every switch off, and nothing for F9 to open
const CHEATS_STUB = `const CHEAT = { god: false, scrap: false, ammo: false, noWaves: false, clock: false }, cheatOn = false;
function cheatTick() {}
function cheatSaves() { return false; }
function toggleCheats() {}
`;

function joinScripts() {
  const order = JSON.parse(fs.readFileSync(path.join(SRC, 'js/load-order.json'), 'utf8'));
  const onDisk = walk(path.join(SRC, 'js')).filter(f => f.endsWith('.js')).map(f => path.relative(path.join(SRC, 'js'), f).split(path.sep).join('/'));
  const missing = onDisk.filter(f => !order.includes(f));
  if (missing.length) throw new Error('These files are not in src/js/load-order.json, add them:\n  ' + missing.join('\n  '));
  const parts = order.map(f => {
    const p = path.join(SRC, 'js', f);
    if (!fs.existsSync(p)) throw new Error('load-order.json lists a file that does not exist: ' + f);
    const code = f === 'ui/cheats.js' && !cheats ? CHEATS_STUB : fs.readFileSync(p, 'utf8');
    return `\n// ==== ${f} ${'='.repeat(Math.max(4, 66 - f.length))}\n` + code;
  });
  return "(() => {\n'use strict';\n" + parts.join('') + '\n})();\n';
}
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]); }

async function buildOnce() {
  const t0 = Date.now();
  fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
  // scripts
  let js = joinScripts();
  if (!dev) js = (await transform(js, { loader: 'js', minify: true, target: 'es2020', legalComments: 'none' })).code;
  fs.writeFileSync(path.join(OUT, 'game.js'), js);
  // styles: index.css @imports every sheet in cascade order
  const css = await esbuild({ entryPoints: [path.join(SRC, 'styles/index.css')], bundle: true, minify: !dev, write: false, logLevel: 'silent' });
  const cssText = css.outputFiles[0].text;
  fs.writeFileSync(path.join(OUT, 'game.css'), cssText);
  // three.js r128, self-hosted
  fs.copyFileSync(path.join(ROOT, 'node_modules/three/build/three.min.js'), path.join(OUT, 'vendor/three.min.js'));
  // pages: the page asks for game.js and game.css by a hash of their contents, so a browser that cached an older build
  // fetches the new one the moment a deploy changes them (and keeps using its cached copy while they stay the same)
  let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  if (!cheats) html = html.replace(/<!-- cheats -->[\s\S]*?<!-- \/cheats -->\n?/g, '');   // the cheat menu's panel goes too
  const ver = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(OUT, 'index.html'), html
    .replace('href="./game.css"', `href="./game.css?v=${ver(cssText)}"`)
    .replace('src="./game.js"', `src="./game.js?v=${ver(js)}"`));
  // one self-contained file (styles and game inlined, three.js from a CDN) for sharing or embedding
  const standalone = html
    .replace('<link rel="stylesheet" href="./game.css">', () => `<style>${cssText}</style>`)
    .replace('<script src="./vendor/three.min.js"></script>', `<script src="${THREE_CDN}"></script>`)
    .replace('<script src="./game.js"></script>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  fs.writeFileSync(path.join(OUT, 'standalone.html'), standalone);
  const kb = f => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
  console.log(`built in ${Date.now() - t0} ms  ·  game.js ${kb('game.js')}  ·  game.css ${kb('game.css')}  ·  standalone.html ${kb('standalone.html')}${dev ? '  (dev)' : ''}${cheats ? '' : '  (no cheat menu)'}`);
}

async function main() {
  await buildOnce();
  if (!serve) return;
  let timer = null;
  fs.watch(SRC, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => buildOnce().catch(e => console.error(e.message)), 80); });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(OUT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(OUT) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }).listen(5173, () => console.log('serving http://localhost:5173  (edit anything in src/ and reload the page)'));
}
main().catch(e => { console.error(e.message); process.exit(1); });
