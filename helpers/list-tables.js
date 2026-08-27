const { Client } = require("D:/project/node_modules/pg");
const c = new Client({
  connectionString: process.env.NEON_URL,
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  const r = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log("TABLES:");
  console.log(r.rows.map(x => x.table_name).join("\n"));
  // Also check columns of likely tables
  const check = ["stock_intro", "stock_industry", "financial_reports", "capital_structure", "stock_basic", "valuation", "company", "twse", "tpex"];
  for (const t of check) {
    const cr = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [t]);
    if (cr.rows.length) {
      console.log(`\n${t} columns:`);
      cr.rows.forEach(r2 => console.log(`  ${r2.column_name} (${r2.data_type})`));
    }
  }
  await c.end();
})();
