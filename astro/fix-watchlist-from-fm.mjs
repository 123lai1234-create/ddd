// 根據 FinMind TaiwanStockInfo audit 修 watchlist + etf_watchlist
// 1) name 對齊 FinMind 官方名稱
// 2) 4 個上櫃 ETF 的 ticker 從 .TW 改 .TWO
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

async function fetchFinMind() {
  const r = await fetch(FINMIND);
  const j = await r.json();
  const map = new Map();
  for (const row of j.data) {
    if (!map.has(row.stock_id)) map.set(row.stock_id, row);
  }
  return map;
}

(async () => {
  console.log("[fix] 抓 FinMind...");
  const fm = await fetchFinMind();
  console.log(`[fix] FinMind unique: ${fm.size}`);

  // 取得 watchlist + etf_watchlist
  const { rows: stocks } = await q("SELECT code, name, ticker FROM watchlist");
  const { rows: etfs }   = await q("SELECT code, name, ticker FROM etf_watchlist");
  const all = [...stocks, ...etfs];

  const fixed = [];
  for (const w of all) {
    const fmRow = fm.get(w.code);
    if (!fmRow) continue;
    const newName = fmRow.stock_name;
    const newTicker = `${w.code}.${fmRow.type === "twse" ? "TW" : "TWO"}`;
    let newNameSql = null, newTickerSql = null;
    if (newName !== w.name) newNameSql = newName;
    if (newTicker !== w.ticker) newTickerSql = newTicker;
    if (!newNameSql && !newTickerSql) continue;
    // 判斷是 watchlist 還是 etf_watchlist
    const isEtf = etfs.some(e => e.code === w.code);
    const table = isEtf ? "etf_watchlist" : "watchlist";
    try {
      // 只 update 有變動的欄位
      if (newNameSql && newTickerSql) {
        await q(`UPDATE ${table} SET name = $1, ticker = $2 WHERE code = $3`, [newNameSql, newTickerSql, w.code]);
      } else if (newNameSql) {
        await q(`UPDATE ${table} SET name = $1 WHERE code = $2`, [newNameSql, w.code]);
      } else if (newTickerSql) {
        await q(`UPDATE ${table} SET ticker = $1 WHERE code = $2`, [newTickerSql, w.code]);
      }
      fixed.push({ table, code: w.code, old_name: w.name, new_name: newNameSql, old_ticker: w.ticker, new_ticker: newTickerSql });
    } catch (e) {
      console.log(`[fix] FAILED ${table}/${w.code}: ${e?.message}`);
    }
  }

  console.log(`\n[fix] total fixed: ${fixed.length}`);
  for (const f of fixed) {
    const parts = [];
    if (f.new_name) parts.push(`name: '${f.old_name}' → '${f.new_name}'`);
    if (f.new_ticker) parts.push(`ticker: '${f.old_ticker}' → '${f.new_ticker}'`);
    console.log(`  ${f.table}/${f.code}: ${parts.join(', ')}`);
  }

  writeFileSync("D:\\project\\astro\\_fix_audit.json", JSON.stringify(fixed, null, 2));
  console.log(`\n[fix] 寫到 D:\\project\\astro\\_fix_audit.json`);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
