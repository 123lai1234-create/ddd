const fs = require('fs');
const path = require('path');
function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name.startsWith('.')) continue;
      walk(p, out);
    } else if (e.name.endsWith('.html') || e.name.endsWith('.astro') || e.name.endsWith('.mjs')) {
      out.push(p);
    }
  }
}
const out = [];
walk('d:/project/astro/src', out);
walk('d:/project/astro/public', out);
const re = /fetch\([^)]{0,200}/g;
let total = 0;
const hits = [];
for (const f of out) {
  try {
    const t = fs.readFileSync(f, 'utf8');
    let m;
    const reLocal = /fetch\s*\([^)]{0,200}/g;
    while ((m = reLocal.exec(t)) !== null) {
      const lineNum = t.substring(0, m.index).split('\n').length;
      hits.push({ f, line: lineNum, snippet: m[0].substring(0, 180).replace(/\n/g, ' ') });
    }
  } catch (e) {}
}
console.log('Total fetch calls:', hits.length);
hits.slice(0, 80).forEach(h => console.log(`${h.line.toString().padStart(4)} | ${h.f.replace(/^d:.+?astro\\/, '')}  |  ${h.snippet}`));