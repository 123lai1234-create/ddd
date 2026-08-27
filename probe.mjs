// Probe Neon: list tables in public schema + describe key tables
import pg from 'pg';
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL missing'); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const tabs = await c.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY table_name`);
  console.log('TABLES:', tabs.rows.map(r => r.table_name).join(', '));
  for (const t of ['revenue','financial_reports','institutional','ai_capex','etf_holdings','dividend_calendar']) {
    const col = await c.query(`SELECT column_name, data_type, is_nullable
      FROM information_schema.columns WHERE table_schema='public' AND table_name=$1
      ORDER BY ordinal_position`, [t]);
    if (col.rows.length) {
      console.log(`\n[${t}] ${col.rows.length} cols:`);
      for (const r of col.rows) console.log(`  ${r.column_name} ${r.data_type}${r.is_nullable==='NO'?' NOT NULL':''}`);
    } else {
      console.log(`\n[${t}] NOT FOUND`);
    }
  }
  console.log('\nROW COUNTS:');
  for (const t of ['revenue','financial_reports','institutional','ai_capex','etf_holdings','dividend_calendar']) {
    try {
      const r = await c.query(`SELECT count(*)::int AS n FROM public.${t}`);
      console.log(`  ${t}: ${r.rows[0].n}`);
    } catch (e) { console.log(`  ${t}: ERR ${e.message}`); }
  }
} finally { await c.end(); }
