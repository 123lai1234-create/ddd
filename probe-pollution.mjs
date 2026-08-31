// 確認要 DELETE 的污染 markers 筆數
const u = "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const r = await fetch("https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)", "Neon-Connection-String": u },
  body: JSON.stringify({
    query: `SELECT
              CASE
                WHEN text LIKE 'x ||%' THEN 'x_開頭'
                WHEN text LIKE 'test ||%' THEN 'test_開頭'
                WHEN text LIKE ' ||%' THEN '開頭_||_空白'
                WHEN text LIKE '||%' THEN '開頭_||'
                ELSE '正常'
              END AS category,
              COUNT(*)::int AS n,
              MIN(id) AS min_id,
              MAX(id) AS max_id
            FROM markers
            GROUP BY 1
            ORDER BY n DESC`,
    params: []
  })
});
const j = await r.json();
console.log("=== markers text pollution 統計 ===");
let total = 0, polluted = 0;
for (const row of j.rows || []) {
  console.log(`  ${row.category}: ${row.n} 筆 (id ${row.min_id} - ${row.max_id})`);
  total += row.n;
  if (row.category !== "正常") polluted += row.n;
}
console.log(`\n總 ${total} 筆，污染 ${polluted} 筆 (${(polluted/total*100).toFixed(1)}%)`);
