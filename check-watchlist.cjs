const { Client } = require('pg');
const url = process.env.DB_URL;
(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  const r = await c.query('SELECT COUNT(*) as total, COUNT(DISTINCT code) as unique_codes FROM market_instruments');
  console.log('Total:', r.rows[0].total, 'Unique codes:', r.rows[0].unique_codes);
  const r2 = await c.query('SELECT code, name, ticker, exchange FROM market_instruments ORDER BY code LIMIT 20');
  for (const row of r2.rows) console.log(' ', row.code, row.name, row.ticker, row.exchange);
  await c.end();
})();
