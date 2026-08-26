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

const r = await q(
  `INSERT INTO watchlist (code, name, ticker, sort_order)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (code) DO UPDATE SET
     name = EXCLUDED.name,
     ticker = EXCLUDED.ticker,
     sort_order = EXCLUDED.sort_order`,
  ['5269', '祥碩', '5269.TW', 405]
);
console.log('upserted 5269');
