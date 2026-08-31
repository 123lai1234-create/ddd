const fs = require('fs');

const file = 'D:/project/astro/src/pages/about.astro';
const content = fs.readFileSync(file, 'utf8');
const marker = 'scripts/app-config.js';
const idx = content.indexOf(marker);
console.log('marker at:', idx);
if (idx > 0) {
  // The chars immediately before: shows raw bytes
  const before = content.slice(idx - 10, idx + 80);
  // Find actual sequence
  const scriptStart = content.indexOf('<script', idx - 30);
  const scriptEnd = content.indexOf('</script>', idx);
  console.log('Script tag:', JSON.stringify(content.slice(scriptStart, scriptEnd + 9)));
  // Try to find both versions
  const v1 = '<script src="scripts/app-config.js"></script>';
  const v2 = '<script src=\\"scripts/app-config.js\\"></script>';
  console.log('v1 (no escape) found:', content.includes(v1));
  console.log('v2 (escaped) found:', content.includes(v2));
}
