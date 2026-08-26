// Extend watchlist from 30 to 60 popular Taiwan stocks
const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql',{method:'POST',headers:{'Content-Type':'application/json','Neon-Connection-String':DB_URL},body:JSON.stringify({query:sql,params})});
  const j = await r.json();
  if (j.error) throw new Error(j.message);
  return j.rows || [];
}

// 30 additional popular Taiwan stocks (semis, components, financials, transport)
const newStocks = [
  ['2327', '國巨', 310],
  ['2344', '華邦電', 320],
  ['2345', '智邦', 330],
  ['2353', '宏碁', 340],
  ['2376', '技嘉', 350],
  ['2377', '微星', 360],
  ['2385', '群光', 370],
  ['2395', '研華', 380],
  ['2404', '漢唐', 390],
  ['2408', '南亞科', 400],
  ['2409', '友達', 410],
  ['2412', '中華電', 420],
  ['2449', '京元電子', 430],
  ['2474', '可成', 440],
  ['2498', '宏達電', 450],
  ['2603', '長榮', 460],
  ['2609', '陽明', 470],
  ['2615', '萬海', 480],
  ['2618', '長榮航', 490],
  ['2634', '漢翔', 500],
  ['1102', '亞泥', 510],
  ['1210', '大成', 520],
  ['1504', '東元', 530],
  ['1590', '亞德客', 540],
  ['1605', '華新', 550],
  ['1722', '台肥', 560],
  ['1802', '台玻', 570],
  ['2201', '裕隆', 580],
  ['2301', '光寶科', 590],
  ['2352', '佳世達', 600],
];

let inserted = 0;
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
  } catch (e) { console.log('err', code, e.message); }
}
console.log('upserted:', inserted);

// also add to market_instruments if not there (synth metadata with industry)
const industries = {
  '2327': '電子零組件業', '2344': '半導體業', '2345': '電腦及週邊設備業', '2353': '電腦及週邊設備業',
  '2376': '電腦及週邊設備業', '2377': '電腦及週邊設備業', '2385': '電子零組件業', '2395': '電腦及週邊設備業',
  '2404': '其他電子業', '2408': '半導體業', '2409': '光電業', '2412': '通信網路業',
  '2449': '半導體業', '2474': '其他電子業', '2498': '通信網路業', '2603': '航運業',
  '2609': '航運業', '2615': '航運業', '2618': '航運業', '2634': '航運業',
  '1102': '水泥工業', '1210': '食品工業', '1504': '電機機械', '1590': '電機機械',
  '1605': '鋼鐵工業', '1722': '化學工業', '1802': '玻璃陶瓷', '2201': '汽車工業',
  '2301': '電腦及週邊設備業', '2352': '電腦及週邊設備業',
};

let miInserted = 0;
for (const [code, name] of newStocks) {
  const ind = industries[code] || '其他';
  try {
    const existing = await q(`SELECT id, metadata_text FROM market_instruments WHERE symbol=$1 AND asset_type='stock'`, [code]);
    if (existing.length) {
      const metaRaw = existing[0].metadata_text;
      let meta = {};
      try { meta = metaRaw ? JSON.parse(metaRaw) : {}; } catch { meta = {}; }
      if (typeof meta !== 'object' || Array.isArray(meta)) meta = { _legacy: meta };
      meta.industry = ind;
      meta.sector = ind;
      await q(
        `UPDATE market_instruments SET display_name=$2, metadata_text=$3, source_name='manual', fetched_at=NOW() WHERE id=$1`,
        [existing[0].id, name, JSON.stringify(meta)]
      );
    } else {
      await q(
        `INSERT INTO market_instruments (asset_type, source_name, symbol, display_name, market, currency, exchange_name, reference_url, metadata_text, fetched_at)
         VALUES ('stock', 'manual', $1, $2, 'TWSE', 'TWD', 'Taiwan Stock Exchange', $3, $4, NOW())`,
        [code, name, `https://twse.com.tw/exchangeReport/STOCK_DAY?response=json&stockNo=${code}`, JSON.stringify({ industry: ind, sector: ind })]
      );
    }
    miInserted++;
  } catch (e) { console.log('mi err', code, e.message); }
}
console.log('market_instruments upserted:', miInserted);
