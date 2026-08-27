const fs = require('fs');
let t = fs.readFileSync('d:/project/api/catchall.mjs', 'utf8');
// Cast `r` to `any` so the destructured field is also `any`,
// eliminating the union narrowing error from tsc.
const fixes = [
  // loadMacroYields & loadIndexInstitutional
  ["const okCount = results.map(r => ({ok: r.ok, count: (r && r.count) || 0})).filter(x => x.ok).reduce((s, x) => s + x.count, 0);",
   "const okCount = results.map((r: any) => ({ok: r.ok, count: (r && r.count) || 0})).filter(x => x.ok).reduce((s, x) => s + (x.count || 0), 0);"],
  // loadBigHoldersFinMind & loadFinancialReportsFinMind
  ["const inserted = results.map(r => ({ok: r.ok, inserted: (r && r.inserted) || 0})).filter(x => x.ok).reduce((s, x) => s + x.inserted, 0);",
   "const inserted = results.map((r: any) => ({ok: r.ok, inserted: (r && r.inserted) || 0})).filter(x => x.ok).reduce((s, x) => s + (x.inserted || 0), 0);"],
];
let changed = 0;
for (const [from, to] of fixes) {
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
