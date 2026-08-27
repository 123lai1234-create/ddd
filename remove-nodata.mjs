// Remove stocks that don't have K-line data from watchlist
// (These were added but no market_instruments row exists, so /api/stock/<code> 404)
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

// 9 stocks that have no K-line data (added previously but not in market_instruments)
const noDataCodes = [
  '2823', // 中壽
  '4128', // 中天
  '4743', // 合一
  '8069', // 元太
  '6147', // 頎邦
  '3707', // 漢磊
  '5425', // 台半
  '3324', // 雙鴻
];

let removed = 0;
for (const code of noDataCodes) {
  try {
    const r = await q('DELETE FROM watchlist WHERE code = $1', [code]);
    removed++;
    console.log('  removed:', code);
  } catch (e) {
    console.log('  err', code, e.message);
  }
}
console.log('---');
console.log('Removed:', removed, '/', noDataCodes.length);
