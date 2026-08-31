// 看 x 開頭後面分布（要區分純 "x" vs "x || {污染}")
const u = "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const r = await fetch("https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)", "Neon-Connection-String": u },
  body: JSON.stringify({
    query: `SELECT
              CASE
                WHEN text = 'x' THEN 'x_純文字'
                WHEN text LIKE 'x || {%' THEN 'x_||_{污染}'
                WHEN text LIKE 'x || %' THEN 'x_||_其他'
                ELSE 'x_其他'
              END AS category,
              COUNT(*)::int AS n,
              MIN(id) AS min_id,
              MAX(id) AS max_id
            FROM markers
            WHERE text LIKE 'x%'
            GROUP BY 1
            ORDER BY n DESC`,
    params: []
  })
});
const j = await r.json();
console.log("=== 'x' 開頭 markers 細分 ===");
for (const row of j.rows || []) {
  console.log(`  ${row.category}: ${row.n} 筆 (id ${row.min_id} - ${row.max_id})`);
}

// 抽 3 筆「x_||_其他」看長相
const r2 = await fetch("https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)", "Neon-Connection-String": u },
  body: JSON.stringify({
    query: `SELECT id, code, date, type, LEFT(text, 100) AS text_head
            FROM markers
            WHERE text LIKE 'x || %' AND text NOT LIKE 'x || {%'
            ORDER BY id DESC LIMIT 5`,
    params: []
  })
});
const j2 = await r2.json();
console.log("\n=== 'x || _其他' 抽 5 筆 ===");
for (const row of j2.rows || []) {
  console.log(`  id=${row.id} ${row.code} ${row.date} ${row.type}: ${JSON.stringify(row.text_head)}`);
}
