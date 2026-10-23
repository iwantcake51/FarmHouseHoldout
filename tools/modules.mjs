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

// files: [{ file: 'core/math.js', src }] in load order. Returns a list of problems (empty when all is well), with each
// file's parsed code on it (.asts, by file) for stripModule to reuse
export function checkModules(files) {
  const mods = new Map(), errs = [], used = new Set(), place = new Map(files.map((f, i) => [f.file, i]));
  const at = (f, node) => `src/js/${f}:${node.loc.start.line}`;
  for (const { file, src } of files) {
    let ast;
    try { ast = parse(src); } catch (e) { errs.push(`src/js/${file}:${e.loc ? e.loc.line : '?'}  ${e.message}`); continue; }
    const scope = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' }).scopes.find(s => s.type === 'module');
    const exports = new Set(), groups = [];
    for (const st of ast.body) if (st.type === 'ExportNamedDeclaration') {
      if (!st.declaration) { errs.push(`${at(file, st)}  export the declaration itself (export const ...), not a list`); continue; }
      const d = st.declaration;
      const names = d.id ? [d.id.name] : scope.variables.filter(v => v.defs.some(df => df.parent === d)).map(v => v.name);
      names.forEach(n => exports.add(n)); groups.push({ st, names });
    } else if (/^Export/.test(st.type)) errs.push(`${at(file, st)}  only named exports of declarations are used here`);
    mods.set(file, { ast, scope, exports, groups });
  }
  for (const [file, { ast, scope }] of mods) {
    for (const st of ast.body) {
      if (st.type !== 'ImportDeclaration') continue;
      const from = path.posix.join(path.posix.dirname(file), st.source.value), m = mods.get(from);
      if (!m) { errs.push(`${at(file, st)}  imports from ${st.source.value}, which isn't one of the game's files`); continue; }
      for (const sp of st.specifiers) {
        if (sp.type !== 'ImportSpecifier' || sp.imported.name !== sp.local.name) { errs.push(`${at(file, sp)}  import names as they are ({ name }), not renamed or as a namespace`); continue; }
        if (!m.exports.has(sp.imported.name)) errs.push(`${at(file, sp)}  ${from} doesn't export ${sp.imported.name}`);
        used.add(from + ':' + sp.imported.name);
        // used as the file loads (not only inside its functions): the file it comes from has to load first
        const v = scope.variables.find(q => q.name === sp.local.name);
        const early = v && v.references.find(r => atLoad(r.from, scope, ast));
        if (early && place.get(from) > place.get(file)) errs.push(`${at(file, early.identifier)}  ${sp.local.name} is used as this file loads, but ${from} loads after it (src/js/load-order.json)`);
      }
    }
    for (const v of scope.variables) {
      if (!v.defs.some(d => d.type === 'ImportBinding')) continue;
      if (!v.references.length) errs.push(`${at(file, v.identifiers[0])}  ${v.name} is imported but not used`);
      for (const r of v.references) if (r.isWrite()) errs.push(`${at(file, r.identifier)}  ${v.name} belongs to another file: change it through its setter`);
    }
    // what's declared here and used nowhere, here or (exported) anywhere else
    for (const v of scope.variables) {
      const d = v.defs[0]; if (d.type === 'ImportBinding') continue;
      // (a function calling itself doesn't count)
      if (!v.references.some(r => r.isRead() && !(r.identifier.range[0] >= d.node.range[0] && r.identifier.range[1] <= d.node.range[1]))) mods.get(file).unread = [...(mods.get(file).unread || []), v];
    }
    const seen = new Set();
    for (const r of scope.through) {
      const n = r.identifier.name;
      if (GLOBALS.has(n) || seen.has(n)) continue;
      seen.add(n); errs.push(`${at(file, r.identifier)}  ${n} isn't declared here or imported`);
    }
  }
  for (const [file, m] of mods) {
    // (one export statement can declare several names: it's enough that one of them is imported somewhere)
    for (const g of m.groups) if (!g.names.some(n => used.has(file + ':' + n)) && !g.names.every(n => (m.unread || []).some(v => v.name === n))) errs.push(`${at(file, g.st)}  ${g.names.join(', ')} ${g.names.length > 1 ? 'are' : 'is'} exported but no other file imports ${g.names.length > 1 ? 'them' : 'it'}`);
    for (const v of m.unread || []) if (!used.has(file + ':' + v.name)) errs.push(`${at(file, v.identifiers[0])}  ${v.name} is declared but never used`);
  }
  errs.asts = new Map([...mods].map(([f, m]) => [f, m.ast]));
  return errs;
}
// whether code in this scope runs as the file loads: at the top, or in a function called straight away there
function atLoad(sc, mod, ast) {
  for (let q = sc; q && q !== mod; q = q.upper) if (q.type === 'function' && !isIIFE(q.block, ast)) return false;
  return true;
}
const iifes = new WeakMap();
function isIIFE(fn, ast) {
  if (!iifes.has(ast)) {
    const set = new Set();
    const walk = n => { if (!n || typeof n.type !== 'string') return; if (n.type === 'CallExpression' && /Function/.test(n.callee.type)) set.add(n.callee); if (/Function/.test(n.type) && n.type !== 'FunctionDeclaration' && n !== ast) { /* nested functions are walked too: an IIFE inside one only runs when it does, which atLoad's walk up handles */ } for (const k in n) { const c = n[k]; if (Array.isArray(c)) c.forEach(walk); else if (c && typeof c.type === 'string' && k !== 'parent') walk(c); } };
    walk(ast); iifes.set(ast, set);
  }
  return iifes.get(ast).has(fn);
}

// one file's code without its import statements and export keywords, for joining into the one-scope script
export function stripModule(src, ast = parse(src)) {
  const cuts = [];
  for (const st of ast.body) {
    // (an import leaves its lines behind, empty, so every line of the file stays where it was: the dev build's source
    // map counts on it)
    if (st.type === 'ImportDeclaration') cuts.push([st.start, st.end, '\n'.repeat((src.slice(st.start, st.end).match(/\n/g) || []).length)]);
    else if (st.type === 'ExportNamedDeclaration' && st.declaration) cuts.push([st.start, st.declaration.start, '']);
  }
  let out = src;
  for (const [s, e, t] of cuts.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + t + out.slice(e);
  return out;
}
