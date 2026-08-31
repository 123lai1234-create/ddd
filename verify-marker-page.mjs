// Playwright 開瀏覽器實打 marker_history 頁面 + console check
import { chromium } from "playwright";

const url = "https://donttalk.vercel.app/stock/marker_history";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const consoleMsgs = [];
const failedReqs = [];
page.on("console", (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
page.on("requestfailed", (r) => failedReqs.push({ url: r.url(), method: r.method(), failure: r.failure() }));
page.on("response", (r) => {
  if (r.url().includes("/api/markers")) {
    console.log(`  api: ${r.status()} ${r.url().replace("https://donttalk.vercel.app", "")}`);
  }
});

const t0 = Date.now();
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
const dt = Date.now() - t0;
console.log(`page loaded in ${dt}ms\n`);

// 抓 meta 文字（"共 N 筆"）
const meta = await page.locator("#meta").textContent();
console.log("meta:", meta);

// 抓表格前 3 行
const rows = await page.locator("#tbody tr").evaluateAll((trs) =>
  trs.slice(0, 3).map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim()))
);
console.log("first 3 rows:");
for (const r of rows) console.log("  ", JSON.stringify(r));

// 看表格行總數
const totalRows = await page.locator("#tbody tr").count();
console.log(`tbody row count: ${totalRows}`);

// console 訊息
const errors = consoleMsgs.filter((m) => m.type === "error");
console.log(`\nconsole errors: ${errors.length}`);
for (const e of errors) console.log("  ✗", e.text);

// failed request
console.log(`\nfailed requests: ${failedReqs.length}`);
for (const f of failedReqs) console.log("  ✗", f.method, f.url, f.failure?.errorText);

await page.screenshot({ path: "D:/project/marker_history_after_fix.png", fullPage: false });
console.log("\nscreenshot saved: D:/project/marker_history_after_fix.png");

await browser.close();
