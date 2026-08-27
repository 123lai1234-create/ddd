const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql',{method:'POST',headers:{'Content-Type':'application/json','Neon-Connection-String':DB_URL},body:JSON.stringify({query:sql,params})});
  const j = await r.json();
  console.log('status:', r.status, 'err:', j.error?.message || '(none)');
  return j.rows || [];
}
// Check what unique constraints are on knowledge_library
const all = await q("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'knowledge_library'::regclass");
for (const r of all) console.log(r.conname, '|', r.def);
