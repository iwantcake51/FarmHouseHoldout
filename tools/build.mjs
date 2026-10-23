// Builds the game into dist/ (and a single-file dist/standalone.html).
//
//   node tools/build.mjs           production build: one minified game.js + game.css
//   node tools/build.mjs --dev     readable build with file banners, for debugging
//   node tools/build.mjs --serve   dev build + local server on http://localhost:5173, rebuilds on every save
//
// The game is browser JavaScript split across src/js/<system>/*.js, each file an ES module that imports what it uses
// from the others (tools/modules.mjs checks them all on every build). For the browser they are joined in the order
// listed in src/js/load-order.json into one script, wrapped in a single function, so the order matters for top-level
// statements that run immediately (building the world, creating materials, and so on).
import { build as esbuild, transform } from 'esbuild';
import { checkModules, stripModule } from './modules.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src'), OUT = path.join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));
const serve = args.has('--serve'), dev = serve || args.has('--dev');
// PeerJS, for co-op (src/js/net/net.js loads it the first time someone hosts or joins); the one-file build takes it from a CDN
const PEER_VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/peerjs/package.json'), 'utf8')).version;
const PEER_CDN = `https://cdn.jsdelivr.net/npm/peerjs@${PEER_VER}/dist/peerjs.min.js`;
// the F9 cheat menu (src/js/ui/cheats.js) is for testing: Netlify's production deploy of main is built with CHEATS=off
// (netlify.toml), which leaves it out of the game altogether, its panel and all. Deploy previews, branch deploys and
// local builds keep it
const cheats = process.env.CHEATS ? process.env.CHEATS !== 'off' : process.env.CONTEXT !== 'production';
// what stands in for ui/cheats.js without it: every switch off, and nothing for F9 to open
const CHEATS_STUB = `const CHEAT = { god: false, scrap: false, ammo: false, noWaves: false, clock: false }, cheatOn = false;
function cheatTick() {}
function cheatSaves() { return false; }
function cheatIs() { return false; }
function cheatSpeed() { return 1; }
function cheatAI() { return { off: false, passive: false, speed: 1, dmg: 1, hp: 1 }; }
function cheatLook() { return null; }
function toggleCheats() {}
`;

function joinScripts() {
  const order = JSON.parse(fs.readFileSync(path.join(SRC, 'js/load-order.json'), 'utf8'));
  const onDisk = walk(path.join(SRC, 'js')).filter(f => f.endsWith('.js')).map(f => path.relative(path.join(SRC, 'js'), f).split(path.sep).join('/'));
  const missing = onDisk.filter(f => !order.includes(f));
  if (missing.length) throw new Error('These files are not in src/js/load-order.json, add them:\n  ' + missing.join('\n  '));
  const files = order.map(f => {
    const p = path.join(SRC, 'js', f);
    if (!fs.existsSync(p)) throw new Error('load-order.json lists a file that does not exist: ' + f);
    return { file: f, src: fs.readFileSync(p, 'utf8') };
  });
  const errs = checkModules(files);
  if (errs.length) throw new Error(`The game's imports and exports don't add up (${errs.length}):\n  ` + errs.slice(0, 40).join('\n  ') + (errs.length > 40 ? '\n  ...' : ''));
  // (where each file's first line lands in the joined script, for the dev build's source map: stripModule keeps every
  // line where it was)
  let line = 2; const at = [];
  const parts = files.map(({ file: f, src }) => {
    const code = f === 'ui/cheats.js' && !cheats ? CHEATS_STUB : stripModule(src, errs.asts.get(f));
    at.push(code === CHEATS_STUB ? null : { file: f, src, line: line + 2, n: code.split('\n').length });
    line += 2 + (code.match(/\n/g) || []).length;
    return `\n// ==== ${f} ${'='.repeat(Math.max(4, 66 - f.length))}\n` + code;
  });
  return { js: "(() => {\n'use strict';\n" + parts.join('') + '\n})();\n', at };
}
// a source map for the dev build, line by line: the browser's errors and debugger show src/js/<file>:<line>
function sourceMap(at) {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const vlq = n => { let v = n < 0 ? (-n << 1) | 1 : n << 1, out = ''; do { let d = v & 31; v >>>= 5; if (v) d |= 32; out += B64[d]; } while (v); return out; };
  const files = at.filter(Boolean), lines = [];
  let ps = 0, pl = 0;
  files.forEach((f, si) => {
    while (lines.length < f.line) lines.push('');
    for (let i = 0; i < f.n; i++) { lines.push(vlq(0) + vlq(si - ps) + vlq(i - pl) + vlq(0)); ps = si; pl = i; }
  });
  return JSON.stringify({ version: 3, file: 'game.js', sources: files.map(f => '../src/js/' + f.file), sourcesContent: files.map(f => f.src), names: [], mappings: lines.join(';') });
}
// the bundle parsed (and minified, for a production build); on an error, which source file and line it's in, by the
// file banners joinScripts puts between them
async function checkBundle(js) {
  try { return (await transform(js, { loader: 'js', minify: !dev, target: 'es2020', legalComments: 'none' })).code; }
  catch (e) {
    const lines = js.split('\n'), where = (e.errors || []).map(er => {
      const ln = er.location ? er.location.line : 0; let file = '?', at = 0;
      for (let i = ln - 1; i >= 0; i--) { const m = /^\/\/ ==== (\S+) =+$/.exec(lines[i]); if (m) { file = m[1]; at = ln - i - 1; break; } }
      return `  src/js/${file}:${at}  ${er.text}${er.location ? '\n    ' + er.location.lineText.trim().slice(0, 160) : ''}`;
    });
    throw new Error('The game script has an error and would not run:\n' + where.join('\n'));
  }
}
// three.js for the page, as the global THREE the game's files use: only the parts of it they name (every THREE.Something
// in the joined script), so the download carries none of the rest. A name three.js doesn't have fails the build here
async function threeBundle(js) {
  const names = [...new Set(js.match(/\bTHREE\.[A-Za-z_$][\w$]*/g).map(n => n.slice(6)))].sort();
  const out = await esbuild({ stdin: { contents: `import { ${names.join(', ')} } from 'three';\nwindow.THREE = { ${names.join(', ')} };`, resolveDir: ROOT },
    bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, logLevel: 'silent', legalComments: 'none' });
  return out.outputFiles[0].text;
}
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]); }

async function buildOnce() {
  const t0 = Date.now();
  fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
  // recorded sounds (src/sounds: audio/spatial.js, audio/samples.js): copied beside the page, and asked for by a hash of
  // their contents like the scripts, so a deploy that changes one is picked up straight away
  const sounds = fs.existsSync(path.join(SRC, 'sounds')) ? fs.readdirSync(path.join(SRC, 'sounds')) : [];
  fs.rmSync(path.join(OUT, 'sounds'), { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'sounds'), { recursive: true });
  const soundUrl = {};
  for (const f of sounds) {
    const bytes = fs.readFileSync(path.join(SRC, 'sounds', f));
    fs.writeFileSync(path.join(OUT, 'sounds', f), bytes);
    soundUrl[f] = { url: `sounds/${f}?v=${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 10)}`, bytes };
  }
  // scripts
  let { js, at } = joinScripts();
  for (const f of sounds) js = js.split(`'sounds/${f}'`).join(`'${soundUrl[f].url}'`);
  // (audio/samples.js builds its file names, so it's handed the hashes instead)
  js = js.replace('const SOUND_HASH = {};', () => `const SOUND_HASH = ${JSON.stringify(Object.fromEntries(sounds.map(f => [f, soundUrl[f].url.split('?v=')[1]])))};`);
  // every build is parsed whole before it's written, so a slip that would stop the game dead in the browser (a syntax
  // error, or two files declaring the same name at the top level: they all share one scope) fails the build instead,
  // naming the file and line it's in (checkBundle)
  const checked = await checkBundle(js);
  if (!dev) js = checked;
  fs.writeFileSync(path.join(OUT, 'game.js'), dev ? js + '//# sourceMappingURL=game.js.map\n' : js);
  if (dev) fs.writeFileSync(path.join(OUT, 'game.js.map'), sourceMap(at)); else fs.rmSync(path.join(OUT, 'game.js.map'), { force: true });
  // styles: index.css @imports every sheet in cascade order
  const css = await esbuild({ entryPoints: [path.join(SRC, 'styles/index.css')], bundle: true, minify: !dev, write: false, logLevel: 'silent' });
  const cssText = css.outputFiles[0].text;
  fs.writeFileSync(path.join(OUT, 'game.css'), cssText);
  // three.js, self-hosted
  const three = await threeBundle(js);
  fs.writeFileSync(path.join(OUT, 'vendor/three.min.js'), three);
  fs.copyFileSync(path.join(ROOT, 'node_modules/peerjs/dist/peerjs.min.js'), path.join(OUT, 'vendor/peerjs.min.js'));
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
    .replace('<script src="./vendor/three.min.js"></script>', () => `<script>${three.replace(/<\/script/gi, '<\\/script')}</script>\n<script>window.PEERJS_SRC = '${PEER_CDN}';</script>`)
    .replace('<script src="./game.js"></script>', () => `<script>window.SOUND_DATA = ${JSON.stringify(soundData())};</script>\n<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  fs.writeFileSync(path.join(OUT, 'standalone.html'), standalone);
  // (the one-file build carries the sounds in it, as data: URLs)
  function soundData() { return Object.fromEntries(Object.values(soundUrl).map(s => [s.url, `data:${s.url.includes('.ogg') ? 'audio/ogg' : 'audio/mpeg'};base64,` + s.bytes.toString('base64')])); }
  const kb = f => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
  console.log(`built in ${Date.now() - t0} ms  ·  game.js ${kb('game.js')}  ·  ${sounds.length} sounds  ·  game.css ${kb('game.css')}  ·  standalone.html ${kb('standalone.html')}${dev ? '  (dev)' : ''}${cheats ? '' : '  (no cheat menu)'}`);
}

async function main() {
  await buildOnce();
  if (!serve) return;
  let timer = null;
  fs.watch(SRC, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => buildOnce().catch(e => console.error(e.message)), 80); });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
  http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(OUT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(OUT) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }).listen(5173, () => console.log('serving http://localhost:5173  (edit anything in src/ and reload the page)'));
}
main().catch(e => { console.error(e.message); process.exit(1); });
