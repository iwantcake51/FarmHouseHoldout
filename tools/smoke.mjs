// A quick check that the built game actually runs: serves dist/, opens it in a headless Chromium, and fails if the
// page throws, if the title doesn't come up, if the settings panel won't open, or if a run doesn't start and keep
// drawing frames with you walking about and shooting.
//
//   node tools/smoke.mjs            (after npm run build)
//
// Needs Playwright with a Chromium (npm i --no-save playwright && npx playwright install chromium); CHROME_PATH points
// it at another Chromium if need be. The GitHub workflow runs it on every push (.github/workflows/ci.yml).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.png': 'image/png' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { s.statusCode = 404; s.end(); return; }
  s.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); s.end(fs.readFileSync(f));
}).listen(0);
const url = `http://localhost:${srv.address().port}/`;
const fail = msg => { console.error('SMOKE TEST FAILED: ' + msg); process.exitCode = 1; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const frames = () => pg.evaluate(() => new Promise(r => { let n = 0; const t = setTimeout(() => r(n), 15000); const f = () => { if (++n >= 3) { clearTimeout(t); r(n); } else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  await pg.goto(url); await pg.waitForTimeout(5000);
  if (await pg.locator('#title').isHidden()) fail('the title screen never came up');
  // the settings panel opens and closes
  await pg.click('#setBtnTitle'); await pg.waitForTimeout(800);
  if (await pg.locator('#settings').isHidden()) fail('the settings panel did not open');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(800);
  // a run: start it, walk and shoot about, pause and resume
  await pg.click('#startBtn'); await pg.waitForTimeout(8000);
  for (const [k, ms] of [['w', 900], ['a', 700], ['s', 900], ['d', 700]]) { await pg.keyboard.down(k); await pg.mouse.move(400 + ms / 3, 300); await pg.waitForTimeout(ms); await pg.mouse.down(); await pg.waitForTimeout(120); await pg.mouse.up(); await pg.keyboard.up(k); }
  await pg.keyboard.press('r'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(800); await pg.keyboard.press('Escape'); await pg.waitForTimeout(1500);
  if ((await frames()) < 3) fail('the game stopped drawing frames');
  if (errs.length) fail('the page reported errors:\n  ' + errs.slice(0, 8).join('\n  '));
  if (!process.exitCode) console.log('smoke test passed');
} finally { await browser.close(); srv.close(); }
