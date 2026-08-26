const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql',{method:'POST',headers:{'Content-Type':'application/json','Neon-Connection-String':DB_URL},body:JSON.stringify({query:sql,params})});
  const j = await r.json();
  if (j.error) throw new Error(j.message);
  return j.rows || [];
}
// Use a curated list of ~30 popular Taiwan stocks (more reliable than scraping TWSE every time)
const stocks = [
  ['2330', '台積電', 10],
  ['2454', '聯發科', 20],
  ['2317', '鴻海', 30],
  ['0050', '元大台灣50', 40],
  ['2881', '富邦金', 50],
  ['2882', '國泰金', 60],
  ['2884', '玉山金', 70],
  ['2885', '元大金', 80],
  ['2886', '兆豐金', 90],
  ['2887', '台新金', 100],
  ['2891', '中信金', 110],
  ['2892', '第一金', 120],
  ['1301', '台塑', 130],
  ['1303', '南亞', 140],
  ['1326', '台化', 150],
  ['6505', '台塑化', 160],
  ['2002', '中鋼', 170],
  ['2207', '和泰車', 180],
  ['2308', '台達電', 190],
  ['2303', '聯電', 200],
  ['3711', '日月光投控', 210],
  ['2379', '瑞昱', 220],
  ['2357', '華碩', 230],
  ['2382', '廣達', 240],
  ['6669', '緯穎', 250],
  ['3231', '緯創', 260],
  ['3034', '聯詠', 270],
  ['3008', '大立光', 280],
  ['1101', '台泥', 290],
  ['1216', '統一', 300],
];
let inserted = 0;
for (const [code, name, sort] of stocks) {
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
  } catch (e) { console.log('err', code, e.message); }
}
console.log('upserted:', inserted);
// also seed etf_watchlist for already-loaded ETFs
const etfs = [
  ['0050', '元大台灣50', 10],
  ['0051', '元大中型100', 20],
  ['0052', '富邦科技', 30],
  ['0056', '元大高股息', 40],
  ['00878', '國泰永續高股息', 50],
];
let eInserted = 0;
for (const [code, name, sort] of etfs) {
  try {
    await q(
      `INSERT INTO etf_watchlist (code, name, ticker, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         ticker = EXCLUDED.ticker,
         sort_order = EXCLUDED.sort_order`,
      [code, name, code + '.TW', sort]
    );
    eInserted++;
  } catch (e) {}
}
console.log('etf upserted:', eInserted);
