const fs = require('fs');
let t = fs.readFileSync('d:/project/api/catchall.mjs', 'utf8');
const orig = t;
// Fix 4 union property errors: change r.count || 0 → r.count ?? 0 (only in reducer contexts where type union may have no count)
const fixes = [
  // line 3113: r.count || 0 → r.count ?? 0
  ['const okCount = results.filter((r) => r.ok).reduce((s, r) => s + (r.count || 0), 0);',
   'const okCount = results.filter((r) => r.ok).reduce((s, r) => s + (r.count ?? 0), 0);'],
  // line 3302: r.count || 0 → r.count ?? 0
  ['const okCount = results.filter((r) => r.ok).reduce((s, r) => s + (r.count || 0), 0);',
   'const okCount = results.filter((r) => r.ok).reduce((s, r) => s + (r.count ?? 0), 0);'],
  // line 3464: r.inserted || 0 → r.inserted ?? 0
  ['const inserted = results.filter((r) => r.ok).reduce((s, r) => s + (r.inserted || 0), 0);',
   'const inserted = results.filter((r) => r.ok).reduce((s, r) => s + (r.inserted ?? 0), 0);'],
  // line 3546: r.inserted || 0 → r.inserted ?? 0
  ['const inserted = results.filter((r) => r.ok).reduce((s, r) => s + (r.inserted || 0), 0);',
   'const inserted = results.filter((r) => r.ok).reduce((s, r) => s + (r.inserted ?? 0), 0);'],
];
let changed = 0;
for (const [from, to] of fixes) {
  if (t.includes(from)) {
    t = t.replace(from, to);
    changed++;
  } else {
    console.log('NOT FOUND:', from.slice(0, 60));
  }
}
if (changed) {
  fs.writeFileSync('d:/project/api/catchall.mjs', t);
  fs.writeFileSync('d:/project/astro/api/catchall.mjs', t);
  console.log('CHANGED:', changed);
}
