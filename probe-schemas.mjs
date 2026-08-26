const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': DB_URL },
    body: JSON.stringify({ query: sql, params }),
  });
  return (await r.json()).rows || [];
}
for (const t of ['warming_zone_scan', 'index_institutional', 'macro_yields', 'knowledge_library', 'big_holders', 'markers']) {
  const cols = await q("SELECT a.attname, format_type(a.atttypid, a.atttypmod) FROM pg_attribute a JOIN pg_class c ON a.attrelid=c.oid WHERE c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum", [t]);
  if (cols.length) {
    console.log(`--- ${t} (${cols.length} cols) ---`);
    for (const c of cols) console.log('  ' + c.attname + ':' + c.format_type.split(' ')[0]);
  }
}
