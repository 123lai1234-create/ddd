// 查 markers.text 各種 prefix 開頭
import handler from "./astro/api/catchall.mjs";
const r = await handler(new Request("https://test.local/api/markers/history?limit=20", { method: "GET" }));
const j = await r.json();
const rows = j.rows || [];

// 抓 raw text（直接打 DB）
const u = "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const r2 = await fetch("https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)", "Neon-Connection-String": u },
  body: JSON.stringify({ query: "SELECT id, LEFT(text, 20) AS head, LENGTH(text) AS len, text FROM markers ORDER BY id DESC LIMIT 6", params: [] })
});
const j2 = await r2.json();
for (const row of j2.rows || []) {
  console.log(`id=${row.id} len=${row.len} head=${JSON.stringify(row.head)}`);
}

// 顯示 row 4 (id 38321) 完整 text
const id4 = (j2.rows || []).find(x => x.id === 38321);
if (id4) {
  console.log("\n=== row 4 (id 38321) 完整 text (前 200 chars) ===");
  console.log(id4.text.slice(0, 200));
  console.log("\n第一個 ' || ' 出現位置:", id4.text.indexOf(" || "));
  console.log("第一個 '||' 出現位置:", id4.text.indexOf("||"));
}
