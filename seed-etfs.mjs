// Add popular Taiwan ETFs to watchlist
const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': DB_URL
    },
    body: JSON.stringify({ query: sql, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.message);
  return j.rows || [];
}

// 20 popular Taiwan ETFs (sort_order 2000-2199)
const etfs = [
  // === 高股息 (high dividend) ===
  ['0056', '元大高股息', 2000],
  ['00878', '國泰永續高股息', 2010],
  ['00919', '群益台灣精選高息', 2020],
  ['00929', '復華台灣科技優息', 2030],
  ['00940', '元大台灣價值高息', 2040],
  // === 寬基 (broad market) ===
  ['006208', '富邦台50', 2050],  // 0050 的低價版
  ['00646', '富邦深100', 2060],   // 深圳 100
  ['00662', '富邦NASDAQ', 2070],  // NASDAQ
  // === 5G/科技 (tech) ===
  ['00881', '國泰台灣5G+', 2080],
  ['00891', '國泰智能電動車', 2090],
  // === 主題 (thematic) ===
  ['00850', '元大臺灣ESG永續', 2100],
  ['00757', '統一FANG+', 2110],
  // === 債券/平衡 (bond/balanced) ===
  ['00679B', '元大美債20年', 2120],
  ['00687B', '國泰20年美債', 2130],
  ['00937B', '群益ESG投等債20+', 2140],
  // === 反向/槓桿 (inverse/leveraged) ===
  ['00632R', '元大台灣50反1', 2150],
  ['00675L', '富邦恒生國企正2', 2160],
  // === 跨境/海外 (overseas) ===
  ['006205', '富邦上證180', 2170],
  ['00636', '國泰中國A50', 2180],
  // === ESG/永續 ===
  ['00888', '永豐台灣ESG', 2190],
];

let inserted = 0;
let skipped = 0;
const errors = [];
for (const [code, name, sort] of etfs) {
  try {
    await q(
      `INSERT INTO watchlist (code, name, ticker, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         ticker = EXCLUDED.ticker,
         sort_order = EXCLUDED.sort_order`,
      [code, name, code + '.TW', sort]
    );
    inserted++;
  } catch (e) {
    skipped++;
    errors.push(`${code}: ${e.message}`);
  }
}
console.log('Inserted/updated:', inserted);
console.log('Skipped:', skipped);
if (errors.length) {
  console.log('Errors:');
  errors.forEach(e => console.log('  ' + e));
}
console.log('Total in script:', etfs.length);
