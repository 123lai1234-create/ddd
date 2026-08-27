// Cross-check watchlist + etf_watchlist 對 FinMind TaiwanStockInfo
// 用 inline Neon HTTP API
import { writeFileSync } from "node:fs";

const FALLBACK_DB_URL = "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const _UA = "Mozilla/5.0 (compatible; donttalk-stocks/1.0)";

function _dbUrl() { return process.env.DATABASE_URL || FALLBACK_DB_URL; }
function _endpoint(url) { const u = new URL(url); return `https://${u.hostname}/sql`; }
async function q(sql, params = []) {
  const url = _dbUrl();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  let res;
  try {
    res = await fetch(_endpoint(url), {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": _UA, "Neon-Connection-String": url },
      body: JSON.stringify({ query: sql, params }),
      signal: ctrl.signal,
    });
  } catch (e) { clearTimeout(tid); throw new Error(`Neon fetch failed: ${e.name}: ${e.message}`); }
  clearTimeout(tid);
  const text = await res.text();
  if (!res.ok) throw new Error(`Neon HTTP ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  if (json.error) throw new Error(json.error.message || "Neon error");
  return { rows: Array.isArray(json.rows) ? json.rows : [] };
}

const FINMIND = "https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo";

async function fetchAllFinMindStockInfo() {
  const r = await fetch(FINMIND);
  const j = await r.json();
  if (!j.data) throw new Error("FinMind no data");
  const map = new Map();
  for (const row of j.data) {
    if (!map.has(row.stock_id)) map.set(row.stock_id, row);
  }
  return map;
}

async function getWatchlist() {
  const { rows: stocks } = await q("SELECT code, name, ticker, sort_order FROM watchlist ORDER BY sort_order, code");
  const { rows: etfs }   = await q("SELECT code, name, ticker, sort_order FROM etf_watchlist ORDER BY sort_order, code");
  return { stocks, etfs };
}

(async () => {
  console.log("[audit-watchlist] 抓 FinMind TaiwanStockInfo (4305 檔)...");
  const fm = await fetchAllFinMindStockInfo();
  console.log(`[audit-watchlist] FinMind unique: ${fm.size}`);

  const { stocks, etfs } = await getWatchlist();
  console.log(`[audit-watchlist] 本地 watchlist: ${stocks.length} stocks + ${etfs.length} ETFs`);

  const issues = [];
  for (const w of [...stocks, ...etfs]) {
    const fmRow = fm.get(w.code);
    if (!fmRow) {
      issues.push({ code: w.code, type: "MISSING_IN_FINMIND", local_name: w.name, local_ticker: w.ticker });
      continue;
    }
    const localName = (w.name || "").replace(/[（(].*?[）)]/g, "").trim();
    const fmName    = (fmRow.stock_name || "").replace(/[（(].*?[）)]/g, "").trim();
    if (localName !== fmName && !localName.includes(fmName) && !fmName.includes(localName)) {
      issues.push({ code: w.code, type: "NAME_MISMATCH", local_name: localName, fm_name: fmName, fm_type: fmRow.type });
    }
    if (w.ticker && w.ticker.toUpperCase().endsWith(".TW") && fmRow.type === "tpex") {
      issues.push({ code: w.code, type: "TICKER_TYPE_WRONG", local_ticker: w.ticker, fm_type: fmRow.type, hint: "ticker .TW but FinMind says tpex — Yahoo 取上市資料可能 0 results" });
    }
    if (w.ticker && w.ticker.toUpperCase().endsWith(".TWO") && fmRow.type === "twse") {
      issues.push({ code: w.code, type: "TICKER_TYPE_WRONG", local_ticker: w.ticker, fm_type: fmRow.type, hint: "ticker .TWO but FinMind says twse" });
    }
  }

  console.log(`\n[audit-watchlist] issues: ${issues.length}`);
  for (const i of issues) console.log(JSON.stringify(i));

  writeFileSync("D:\\project\\astro\\_audit_issues.json", JSON.stringify(issues, null, 2));
  console.log(`\n[audit-watchlist] 寫到 D:\\project\\astro\\_audit_issues.json`);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
