// 抓一個有「內嵌 JSON position」的 markers row 驗證解析
import handler from "./astro/api/catchall.mjs";
const t0 = Date.now();
const r = await handler(new Request("https://test.local/api/markers/history?limit=20", { method: "GET" }));
const dt = Date.now() - t0;
const payload = await r.json();
console.log(`status=${r.status} dt=${dt}ms count=${payload.count} source=${payload.source} error=${payload.error || "(none)"}`);
const rows = payload.rows || [];

// 過濾出有 position 的
const withPos = rows.filter(x => x.position === "aboveBar" || x.position === "belowBar");
const withClose = rows.filter(x => typeof x.close === "number");
const withCleanText = rows.filter(x => x.marker_text && !x.marker_text.startsWith("x") && !x.marker_text.startsWith("test") && x.marker_text.length < 30);

console.log("total:", rows.length);
console.log("with position:", withPos.length);
console.log("with close (number):", withClose.length);
console.log("with clean marker_text:", withCleanText.length);
if (withPos.length) console.log("\nsample with position:\n" + JSON.stringify(withPos[0], null, 2));
if (withCleanText.length) console.log("\nsample clean marker_text:\n" + JSON.stringify(withCleanText[0], null, 2));
console.log("\n3 first rows:");
console.log(JSON.stringify(rows.slice(0, 3).map(x => ({
  id: x.id, scan_date: x.scan_date, code: x.code,
  source: x.source, position: x.position, marker_text: x.marker_text?.slice(0, 30), close: x.close
})), null, 2));
