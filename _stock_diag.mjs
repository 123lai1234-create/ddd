import fs from 'fs';

const c = fs.readFileSync('D:/project/astro/public/stock-app/index.html', 'utf8');
const lines = c.split('\n');

// 1) startup / init calls
const re = /loadIndex|loadStock|DOMContentLoaded|window\.onload|init\(|startMonitor|startPolling|poll|IX0001|IX0002|currentCode\s*=|defaultCode|_load|boot\(|addEventListener\(["'](load|DOMContentLoaded)/i;
console.log('=== startup/init lines ===');
for (let i = 0; i < lines.length; i++) {
  if (re.test(lines[i])) console.log((i + 1) + ': ' + lines[i].trim().slice(0, 170));
}

// 2) all setMarkers calls
console.log('\n=== setMarkers / marker merge ===');
const re2 = /setMarkers|_mergeAndSetMarkers|_baseMarkers|_eventMarkers/;
for (let i = 0; i < lines.length; i++) {
  if (re2.test(lines[i])) console.log((i + 1) + ': ' + lines[i].trim().slice(0, 170));
}

// 3) update() calls on chart series (unwrapped risk)
console.log('\n=== series .update( calls ===');
const re3 = /Series\.update\(|\.update\(\{/;
for (let i = 0; i < lines.length; i++) {
  if (re3.test(lines[i])) console.log((i + 1) + ': ' + lines[i].trim().slice(0, 170));
}

// 4) createPriceLine / price lines
console.log('\n=== price line calls ===');
const re4 = /createPriceLine|addPriceLine|removePriceLine/;
for (let i = 0; i < lines.length; i++) {
  if (re4.test(lines[i])) console.log((i + 1) + ': ' + lines[i].trim().slice(0, 170));
}
