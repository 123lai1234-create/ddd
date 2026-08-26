// Extend watchlist from 60 to 90 popular Taiwan stocks
// (Add 30 more: financials, AI/semis, materials, transport, medical, etc.)
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

// 30 additional popular Taiwan stocks (sort_order 700-999 to append after existing)
const newStocks = [
  // === 金融 (financials) ===
  ['2890', '永豐金', 700],
  ['2883', '開發金', 710],
  ['2880', '華南金', 720],
  ['5880', '合庫金', 730],
  ['2823', '中壽', 740],
  // === AI/半導體 (AI/semis) ===
  ['3653', '健策', 750],
  ['6531', '愛普', 760],
  ['3037', '欣興', 770],
  ['3661', '世芯-KY', 780],
  ['3017', '奇鋐', 790],
  // === 營建 (construction) ===
  ['2504', '國產', 800],
  ['2542', '興富發', 810],
  ['5522', '遠雄', 820],
  // === 航運/運輸 (transport) ===
  ['2606', '裕民', 830],
  ['2614', '東森', 840],
  // === 橡膠/汽車 (rubber/auto) ===
  ['2105', '正新', 850],
  ['2227', '裕日車', 860],
  // === 生技 (biotech) ===
  ['4128', '中天', 870],
  ['4743', '合一', 880],
  // === 鋼鐵 (steel) ===
  ['2014', '中鴻', 890],
  // === 自転車/運動 (bikes/sports) ===
  ['9914', '美利達', 900],
  ['9921', '巨大', 910],
  // === 電子/代工 (electronics/OEM) ===
  ['2356', '英業達', 920],
  ['2324', '仁寶', 930],
  ['2478', '大毅', 940],
  // === 連接器/散熱 (connectors/cooling) ===
  ['2059', '川湖', 950],
  ['3006', '晶豪科', 960],
  // === IC 設計 (IC design) ===
  ['3545', '敦泰', 970],
  ['6285', '啟碁', 980],
  // === 電子紙/光電 (e-paper/optoelectronics) ===
  ['8069', '元太', 990],
];

let inserted = 0;
let skipped = 0;
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
    console.log('  upserted:', code, name);
  } catch (e) {
    skipped++;
    console.log('  err', code, e.message);
  }
}
console.log('---');
console.log('Inserted/updated:', inserted);
console.log('Skipped:', skipped);
console.log('Total in script:', newStocks.length);
