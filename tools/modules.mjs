// The game's files as ES modules: checking their imports and exports, and joining them into one script.
//
// Every file in src/js imports what it uses from the other files and exports what they use from it, so where anything
// comes from is written at the top of the file that uses it (and editors can follow it). checkModules holds the files
// to that: a name that isn't imported, an import of something that isn't exported, an import that isn't used, or an
// assignment to an imported variable (another file's variable is only read; its file exports a setter, setX, for the
// ones that change from elsewhere) fails the build, naming the file and line.
//
// The game still runs its files in the order of src/js/load-order.json, all in one scope, as it always has (joinModules
// strips the import and export keywords and puts them one after another): the order the world is built in at load stays
// exactly as written, whatever imports what.
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';
import path from 'node:path';

// what the browser provides, besides three.js (THREE) and PeerJS (Peer, loaded when co-op starts: net/net.js)
const GLOBALS = new Set(`Array ArrayBuffer AudioContext BigInt Blob Boolean BroadcastChannel CustomEvent DataView Date
  DOMParser Element Error Event EventTarget Float32Array Float64Array FormData HTMLCanvasElement HTMLElement Image
  ImageData Infinity Int8Array Int16Array Int32Array Intl JSON KeyboardEvent Map Math MouseEvent MutationObserver NaN
  Number Object OfflineAudioContext Path2D Peer PointerEvent Promise Proxy RangeError ReferenceError Reflect RegExp
  ResizeObserver Set String Symbol SyntaxError THREE TextDecoder TextEncoder TypeError URL URLSearchParams Uint8Array
  Uint8ClampedArray Uint16Array Uint32Array WeakMap WeakRef WeakSet WebGL2RenderingContext WebGLRenderingContext
  addEventListener alert atob btoa cancelAnimationFrame cancelIdleCallback clearInterval clearTimeout confirm console
  createImageBitmap crypto decodeURIComponent devicePixelRatio document encodeURIComponent fetch getComputedStyle
  globalThis history innerHeight innerWidth isFinite isNaN localStorage location matchMedia navigator parseFloat
  parseInt performance prompt queueMicrotask removeEventListener requestAnimationFrame requestIdleCallback screen
  sessionStorage setInterval setTimeout structuredClone undefined window`.split(/\s+/));

const parse = src => acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true, ranges: true });   // (eslint-scope needs the ranges)

// files: [{ file: 'core/math.js', src }] in load order. Returns a list of problems (empty when all is well)
export function checkModules(files) {
  const mods = new Map(), errs = [];
  const at = (f, node) => `src/js/${f}:${node.loc.start.line}`;
  for (const { file, src } of files) {
    let ast;
    try { ast = parse(src); } catch (e) { errs.push(`src/js/${file}:${e.loc ? e.loc.line : '?'}  ${e.message}`); continue; }
    const scope = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' }).scopes.find(s => s.type === 'module');
    const exports = new Set();
    for (const st of ast.body) if (st.type === 'ExportNamedDeclaration') {
      if (!st.declaration) { errs.push(`${at(file, st)}  export the declaration itself (export const ...), not a list`); continue; }
      const d = st.declaration;
      if (d.id) exports.add(d.id.name);
      else for (const v of scope.variables) if (v.defs.some(df => df.parent === d)) exports.add(v.name);
    } else if (/^Export/.test(st.type)) errs.push(`${at(file, st)}  only named exports of declarations are used here`);
    mods.set(file, { ast, scope, exports });
  }
  for (const [file, { ast, scope }] of mods) {
    for (const st of ast.body) {
      if (st.type !== 'ImportDeclaration') continue;
      const from = path.posix.join(path.posix.dirname(file), st.source.value), m = mods.get(from);
      if (!m) { errs.push(`${at(file, st)}  imports from ${st.source.value}, which isn't one of the game's files`); continue; }
      for (const sp of st.specifiers) {
        if (sp.type !== 'ImportSpecifier' || sp.imported.name !== sp.local.name) { errs.push(`${at(file, sp)}  import names as they are ({ name }), not renamed or as a namespace`); continue; }
        if (!m.exports.has(sp.imported.name)) errs.push(`${at(file, sp)}  ${from} doesn't export ${sp.imported.name}`);
      }
    }
    for (const v of scope.variables) {
      if (!v.defs.some(d => d.type === 'ImportBinding')) continue;
      if (!v.references.length) errs.push(`${at(file, v.identifiers[0])}  ${v.name} is imported but not used`);
      for (const r of v.references) if (r.isWrite()) errs.push(`${at(file, r.identifier)}  ${v.name} belongs to another file: change it through its setter`);
    }
    const seen = new Set();
    for (const r of scope.through) {
      const n = r.identifier.name;
      if (GLOBALS.has(n) || seen.has(n)) continue;
      seen.add(n); errs.push(`${at(file, r.identifier)}  ${n} isn't declared here or imported`);
    }
  }
  return errs;
}

// one file's code without its import statements and export keywords, for joining into the one-scope script
export function stripModule(src) {
  const ast = parse(src), cuts = [];
  for (const st of ast.body) {
    if (st.type === 'ImportDeclaration') { let e = st.end; while (src[e] === '\n' || src[e] === '\r') e++; cuts.push([st.start, e, '']); }
    else if (st.type === 'ExportNamedDeclaration' && st.declaration) cuts.push([st.start, st.declaration.start, '']);
  }
  let out = src;
  for (const [s, e, t] of cuts.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + t + out.slice(e);
  return out;
}
