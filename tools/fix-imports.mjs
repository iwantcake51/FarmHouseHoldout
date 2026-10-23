// Rewrites every game file's imports and export keywords to match what the code uses: run it after moving code from
// one file to another, or using something from another file for the first time.
//
//   npm run fix-imports
//
// Each file imports exactly the names it uses from the other files (grouped by file, in load order, names sorted), and
// exports exactly the names other files use from it. Only the import statements and the export keywords are touched.
// It can't fix an assignment to another file's variable (that file needs a setter) or a name declared in two files;
// it says so and changes nothing. tools/modules.mjs checks the result on every build.
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'js');
const order = JSON.parse(fs.readFileSync(path.join(JS, 'load-order.json'), 'utf8'));
const place = new Map(order.map((f, i) => [f, i]));
const parse = src => acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true, ranges: true });
const moduleScope = ast => eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' }).scopes.find(s => s.type === 'module');

// each file without its imports and export keywords (where its imports were is kept, to put the new ones back)
const files = order.map(file => {
  const src = fs.readFileSync(path.join(JS, file), 'utf8'), ast = parse(src), cuts = [];
  let at = -1;
  for (const st of ast.body) {
    if (st.type === 'ImportDeclaration') { if (at < 0) at = st.start; let e = st.end; while (src[e] === '\n') e++; cuts.push([st.start, e]); }
    else if (st.type === 'ExportNamedDeclaration' && st.declaration) cuts.push([st.start, st.declaration.start]);
    else if (/^Export/.test(st.type)) throw new Error(`src/js/${file}: only "export" on a declaration is supported`);
  }
  let base = src;
  for (const [a, b] of cuts.sort((x, y) => y[0] - x[0])) base = base.slice(0, a) + base.slice(b);
  // (where the first import began, in the stripped text: less whatever was cut before it)
  if (at >= 0) at -= cuts.filter(([a]) => a < at).reduce((n, [a, b]) => n + b - a, 0);
  return { file, src, base, at };
});
const owner = new Map(), problems = [];
for (const f of files) {
  f.ast = parse(f.base); f.scope = moduleScope(f.ast);
  for (const v of f.scope.variables) {
    if (owner.has(v.name)) problems.push(`${v.name} is declared in both src/js/${owner.get(v.name)} and src/js/${f.file}`);
    owner.set(v.name, f.file);
  }
}
const usedBy = new Map(order.map(f => [f, new Set()]));
for (const f of files) {
  f.need = new Map();
  for (const r of f.scope.through) {
    const n = r.identifier.name, o = owner.get(n);
    if (!o || o === f.file) continue;
    if (r.isWrite()) problems.push(`src/js/${f.file}:${r.identifier.loc.start.line}  assigns to ${n}, which belongs to src/js/${o}: give that file a setter and call it`);
    if (!f.need.has(o)) f.need.set(o, new Set());
    f.need.get(o).add(n); usedBy.get(o).add(n);
  }
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const sortNames = a => [...a].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' }) || (x < y ? -1 : 1));
function importLine(rel, names) {
  const one = `import { ${names.join(', ')} } from '${rel}';`;
  if (one.length <= 120) return one;
  const rows = []; let row = '';
  for (const n of names) { if (row && (row + ', ' + n).length > 116) { rows.push(row + ','); row = n; } else row = row ? row + ', ' + n : n; }
  rows.push(row);
  return `import {\n${rows.map(r => '  ' + r).join('\n')}\n} from '${rel}';`;
}
let changed = 0;
for (const f of files) {
  const edits = [];
  for (const st of f.ast.body) {
    const names = st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name]
      : st.type === 'VariableDeclaration' ? f.scope.variables.filter(v => v.defs.some(d => d.parent === st)).map(v => v.name) : [];
    if (names.some(n => usedBy.get(f.file).has(n))) edits.push([st.start, 'export ']);
  }
  const lines = [...f.need.keys()].sort((a, b) => place.get(a) - place.get(b)).map(o => {
    let rel = path.posix.relative(path.posix.dirname(f.file), o); if (!rel.startsWith('.')) rel = './' + rel;
    return importLine(rel, sortNames(f.need.get(o)));
  });
  if (lines.length) {
    // where the imports were, or else after the file's opening comment (its first // lines, up to a blank line)
    let at = f.at;
    if (at < 0) { const m = f.base.match(/^(?:\/\/.*\n)+\n?/); at = m ? m[0].length : 0; }
    edits.push([at, lines.join('\n') + '\n' + (f.base[at] === '\n' ? '' : '\n')]);
  }
  let out = f.base;
  for (const [i, t] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, i) + t + out.slice(i);
  if (out !== f.src) { fs.writeFileSync(path.join(JS, f.file), out); changed++; console.log('updated src/js/' + f.file); }
}
console.log(changed ? `${changed} file${changed > 1 ? 's' : ''} updated` : 'all imports and exports already match');
