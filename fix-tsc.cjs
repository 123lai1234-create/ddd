const fs = require('fs');
let t = fs.readFileSync('d:/project/api/catchall.mjs', 'utf8');
const orig = t;
t = t.replace('if (etfs.length) params.push(etfs);', 'if (etfs.length) params.push(etfs.join(","));');
t = t.replace('meta = { _legacy: parsed }', 'const _legacy = parsed; meta = { _legacy: _legacy, industry: "", sector_source: "", updated_at: "" };');
if (t !== orig) {
  fs.writeFileSync('d:/project/api/catchall.mjs', t);
  fs.writeFileSync('d:/project/astro/api/catchall.mjs', t);
  console.log('REPLACED. delta bytes:', t.length - orig.length);
} else {
  console.log('NO MATCH');
}
