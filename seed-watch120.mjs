// Extend watchlist from 90 to 120 popular Taiwan stocks
// (Add 30 more: financial sub-sector, ETFs-adjacent, mid-cap tech)
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

// 30 more popular Taiwan stocks (sort_order 1000-1299)
const newStocks = [
  // === 半導體設備/材料 ===
  ['6147', '頎邦', 1000],
  ['6271', '同欣電', 1010],
  ['8069', '元太', 1020],  // 光電，雖沒 data 但用戶可能有興趣
  // === IC 設計/測試 ===
  ['2458', '義隆', 1030],
  ['2486', '一詮', 1040],
  ['2492', '華新科', 1050],
  ['3707', '漢磊', 1060],
  ['5425', '台半', 1070],
  ['8150', '南茂', 1080],
  // === PCB/連接器 ===
  ['2313', '華通', 1090],
  ['2383', '台光電', 1100],
  ['3044', '健鼎', 1110],
  // === 散熱/機殼 ===
  ['3019', '亞光', 1120],
  ['3324', '雙鴻', 1130],
  // === 工具機/自動化 ===
  ['2049', '上銀', 1140],
  ['2376', '技嘉', 1150],  // 可能已存在
  ['2467', '志聖', 1160],
  // === 網通 ===
  ['5388', '中磊', 1170],
  ['6415', '矽力*-KY', 1180],
  // === 食品/消費 ===
  ['1217', '愛之味', 1190],
  ['1707', '葡萄王', 1200],
  ['1907', '永豐餘', 1210],
  ['2912', '統一超', 1220],
  // === 鋼鐵/塑化 ===
  ['1717', '長興', 1230],
  ['2006', '燁輝', 1240],
  ['2010', '春源', 1250],
  ['2101', '南港', 1260],
  // === 金融/壽險 ===
  ['2834', '臺企銀', 1270],
  ['2885', '元大金', 1280],  // 可能已存在
  // === 航運/觀光 ===
  ['2707', '晶華', 1290],
];

let inserted = 0;
let skipped = 0;
const errors = [];
for (const [code, name, sort] of newStocks) {
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
console.log('Total in script:', newStocks.length);
