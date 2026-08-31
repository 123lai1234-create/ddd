// 直接 import catchall.mjs 的 default handler，跑 3 個 marker 端點
import handler from "./astro/api/catchall.mjs";

const tests = [
  { name: "GET /api/markers/history (預設)",   method: "GET",  url: "https://test.local/api/markers/history?limit=5" },
  { name: "GET /api/markers/history?source=event", method: "GET", url: "https://test.local/api/markers/history?limit=3&source=event" },
  { name: "GET /api/markers/history?source=trade", method: "GET", url: "https://test.local/api/markers/history?limit=3&source=trade" },
  { name: "GET /api/markers/history?code=2330",    method: "GET", url: "https://test.local/api/markers/history?code=2330&limit=3" },
  { name: "POST /api/markers/batch_scan (修法後)", method: "POST", url: "https://test.local/api/markers/batch_scan", body: { days: 250, pwd: "test" } },
  { name: "GET  /api/markers/batch_scan/status/<id> (修法後)", method: "GET", url: "https://test.local/api/markers/batch_scan/status/bs-1764566400000" },
  { name: "GET  /api/markers/export.csv",          method: "GET",  url: "https://test.local/api/markers/export.csv?limit=3" },
];

let pass = 0, fail = 0;
for (const t of tests) {
  process.stdout.write(`\n▶ ${t.name}\n`);
  const init = { method: t.method };
  if (t.body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(t.body);
  }
  try {
    const req = new Request(t.url, init);
    const res = await handler(req);
    const status = res.status;
    const ctype = res.headers.get("content-type") || "";
    let payload;
    if (ctype.includes("json")) {
      payload = await res.json();
    } else {
      payload = (await res.text()).slice(0, 200);
    }
    if (status >= 200 && status < 300) {
      pass++;
      console.log(`  ✓ ${status} ${ctype}`);
      if (t.url.includes("markers/history")) {
        const rows = payload.rows || [];
        const summary = `count=${rows.length}, sources={${[...new Set(rows.map(r => r.source))].join(",")||"(empty)"}}, positions={${[...new Set(rows.map(r => r.position))].join(",")||"(empty)"}}`;
        console.log(`  ${summary}`);
        console.log(`  first:`, JSON.stringify(rows[0] || null, null, 2).slice(0, 500));
      } else if (t.url.includes("batch_scan") && t.method === "POST") {
        console.log(`  payload:`, JSON.stringify(payload));
      } else if (t.url.includes("batch_scan/status")) {
        console.log(`  payload:`, JSON.stringify(payload));
      } else {
        console.log(`  payload:`, String(payload).slice(0, 200));
      }
    } else {
      fail++;
      console.log(`  ✗ ${status} ${ctype}`);
      console.log(`  payload:`, JSON.stringify(payload).slice(0, 400));
    }
  } catch (e) {
    fail++;
    console.log(`  ✗ EXCEPTION: ${e.message}`);
  }
}
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
