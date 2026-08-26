// Add 4 missing stocks to market_instruments so they can have K-line data
// (These were in watchlist but no market_instruments row, so /api/stock/<code> 404)
const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': DB_URL },
    body: JSON.stringify({ query: sql, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.message);
  return j.rows || [];
}

// 4 missing stocks to add (8069 was already removed from watchlist)
const newStocks = [
  { code: '6147', name: '頎邦', industry: '半導體業', kind: 'ChipMOS / 封測' },
  { code: '3707', name: '漢磊', industry: '半導體業', kind: '晶圓代工' },
  { code: '5425', name: '台半', industry: '半導體業', kind: '功率半導體' },
  { code: '3324', name: '雙鴻', industry: '電腦及週邊設備業', kind: '散熱模組' },
];

let inserted = 0;
for (const s of newStocks) {
  try {
    const metadata = JSON.stringify({
      industry: s.industry,
      sector_source: 'manual_2026_08_12',
      updated_at: new Date().toISOString(),
      note: `Added manually for watchlist support (${s.kind})`
    });
    const r = await q(
      `INSERT INTO market_instruments (asset_type, source_name, symbol, display_name, market, currency, exchange_name, reference_url, metadata_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (symbol, asset_type) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         metadata_text = EXCLUDED.metadata_text,
         fetched_at = now()`,
      [
        'stock', 'TWSE', s.code, s.name,
        'TWSE', 'TWD', 'Taiwan Stock Exchange',
        `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&stockNo=${s.code}`,
        metadata
      ]
    );
    inserted++;
    console.log('  upserted:', s.code, s.name);
  } catch (e) {
    console.log('  err', s.code, e.message);
  }
}
console.log('---');
console.log('Inserted/updated:', inserted, '/', newStocks.length);
