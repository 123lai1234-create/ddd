// DELETE 污染 markers
const u = "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// 1) 刪除前再 COUNT 確認
const r0 = await fetch("https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)", "Neon-Connection-String": u },
  body: JSON.stringify({ query: "SELECT COUNT(*)::int AS n FROM markers", params: [] })
});
const before = (await r0.json()).rows[0].n;
console.log(`刪除前: ${before} 筆`);

// 2) DELETE 污染
const r1 = await fetch("https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)", "Neon-Connection-String": u },
  body: JSON.stringify({
    query: `DELETE FROM markers
            WHERE text LIKE 'x || {%'
               OR text LIKE 'test || {%'
               OR text LIKE ' || {%'
               OR text LIKE '|| {%'`,
    params: []
  })
});
const del = await r1.json();
console.log("DELETE response:", JSON.stringify(del).slice(0, 200));

// 3) 驗證
const r2 = await fetch("https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)", "Neon-Connection-String": u },
  body: JSON.stringify({ query: "SELECT COUNT(*)::int AS n FROM markers", params: [] })
});
const after = (await r2.json()).rows[0].n;
console.log(`刪除後: ${after} 筆（清掉 ${before - after} 筆）`);

// 4) 再 sanity check 沒污染了
const r3 = await fetch("https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)", "Neon-Connection-String": u },
  body: JSON.stringify({
    query: `SELECT
              CASE
                WHEN text LIKE 'x ||%' THEN 'x_污染'
                WHEN text LIKE 'test ||%' THEN 'test_污染'
                WHEN text LIKE ' ||%' THEN '||_污染'
                ELSE '正常'
              END AS cat, COUNT(*)::int AS n
            FROM markers GROUP BY 1 ORDER BY n DESC`,
    params: []
  })
});
const j3 = await r3.json();
console.log("\n=== 清理後分布 ===");
for (const row of j3.rows || []) console.log(`  ${row.cat}: ${row.n} 筆`);

// 5) 前 3 筆 sample 確認正常
const r4 = await fetch("https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)", "Neon-Connection-String": u },
  body: JSON.stringify({
    query: "SELECT id, code, date, type, text FROM markers ORDER BY id DESC LIMIT 3",
    params: []
  })
});
const j4 = await r4.json();
console.log("\n=== 清理後前 3 筆 ===");
for (const row of j4.rows || []) {
  console.log(`  id=${row.id} ${row.code} ${row.date} ${row.type}: ${JSON.stringify(row.text?.slice(0, 80))}`);
}
