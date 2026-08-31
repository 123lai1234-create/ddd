const fs = require('fs');
const file = 'D:/project/astro/public/stock/btc.html';
let c = fs.readFileSync(file, 'utf8');

const oldCode = "    let twseHist = [];\n    try {\n      const r = await fetch(API + `/api/index/TWSE?range=${days}d`);\n      const j = await r.json();\n      twseHist = j.history || j.bars || [];\n    } catch (_) {}";
const newCode = "    let twseHist = [];\n    try {\n      const r = await fetch(API + '/api/index/TWSE?range=' + days + 'd');\n      const j = await r.json();\n      twseHist = (j.candles || j.history || j.bars || []).map(b => ({\n        time: b.time || new Date(b.time_iso || b.date).getTime(),\n        close: Number(b.close)\n      })).filter(b => b.time && Number.isFinite(b.close));\n    } catch (_) {}";
if (c.includes(oldCode)) {
  c = c.replace(oldCode, newCode);
  fs.writeFileSync(file, c, 'utf8');
  console.log('FIXED');
} else {
  console.log('NOT FOUND');
}