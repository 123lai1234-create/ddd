const fs = require('fs');
const file = 'D:/project/astro/public/stock/currency.html';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/updateUSD TWDCard/g, 'updateUSDTWDCard');
content = content.replace(/updateCNY TWDCard/g, 'updateCNYTWDCard');
fs.writeFileSync(file, content, 'utf8');
console.log('Fixed typos');
console.log('Remaining issues:', (content.match(/USD TWDCard|CNY TWDCard/g) || []).length);