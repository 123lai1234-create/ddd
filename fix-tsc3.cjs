const fs = require('fs');
let t = fs.readFileSync('d:/project/api/catchall.mjs', 'utf8');
// We need to type-assert the reducer arg. The cleanest approach is to switch
// from `r.count ?? 0` / `r.inserted ?? 0` to a narrowing cast that the tsc
// checker accepts. Easiest: cast the array of results to a wider type first
// using `results.map(r => ({ ok: r.ok, count: r.count, inserted: r.inserted }))`,
// which produces a homogeneous shape. Use this pattern at all 4 sites.
const fixes = [
  // loadMacroYields: count
  ['const okCount = results.filter((r) => r.ok).reduce((s, r) => s + (r.count ?? 0), 0);',
   'const okCount = results.map(r => ({ok: r.ok, count: (r && r.count) || 0})).filter(x => x.ok).reduce((s, x) => s + x.count, 0);'],
  // loadIndexInstitutional: count
  ['const okCount = results.filter((r) => r.ok).reduce((s, r) => s + (r.count ?? 0), 0);',
   'const okCount = results.map(r => ({ok: r.ok, count: (r && r.count) || 0})).filter(x => x.ok).reduce((s, x) => s + x.count, 0);'],
  // loadBigHoldersFinMind: inserted
  ['const inserted = results.filter((r) => r.ok).reduce((s, r) => s + (r.inserted ?? 0), 0);',
   'const inserted = results.map(r => ({ok: r.ok, inserted: (r && r.inserted) || 0})).filter(x => x.ok).reduce((s, x) => s + x.inserted, 0);'],
  // loadFinancialReportsFinMind: inserted
  ['const inserted = results.filter((r) => r.ok).reduce((s, r) => s + (r.inserted ?? 0), 0);',
   'const inserted = results.map(r => ({ok: r.ok, inserted: (r && r.inserted) || 0})).filter(x => x.ok).reduce((s, x) => s + x.inserted, 0);'],
];
let changed = 0;
for (const [from, to] of fixes) {
  // replace all occurrences (each fix appears twice in the file because both
  // loadMacroYields and loadIndexInstitutional have the same `const okCount =` line)
  while (t.includes(from)) {
    t = t.replace(from, to);
    changed++;
  }
}
if (changed) {
  fs.writeFileSync('d:/project/api/catchall.mjs', t);
  fs.writeFileSync('d:/project/astro/api/catchall.mjs', t);
  console.log('CHANGED:', changed);
}
