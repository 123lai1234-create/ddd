#!/usr/bin/env node
// Render cron job — 每日 06:30 UTC = 14:30 Asia/Taipei（load_all 之後 30 分鐘）
// 跑網站健康檢查 + 自動修復。
//
// 三個 tier：
//   Tier 1 — Render catchall 9 個核心 API（含 DAMO/ETF/macro/markers/uptrend/warming/etf/<code>）
//   Tier 2 — Vercel 7 個關鍵 HTML 頁
//   Tier 3 — admin 診斷（health/tables, markers/backup）
//
// 自動修復（保守版，只做無破壞性的）：
//   - stock_damo_filter 沒資料 → POST /refresh
//   - etf_signal_filter 沒資料 → POST /refresh
//   - signal_filter 沒資料 → POST /refresh
//   - markers.backup 0 rows → POST /admin/load/all
//   ❌ 不自動 deploy（會誤觸、會壞）
//
// 結果寫兩份：
//   1. logs/health_YYYY-MM-DD.jsonl（Render local disk）
//   2. 從 GET /api/admin/health/latest 看最新一次結果
//
// 環境變數：
//   RENDER_BASE  — Render catchall 網域（預設 https://donttalk-catchall.onrender.com）
//   VERCEL_BASE  — Vercel 站網域（預設 https://donttalk.vercel.app）
//   TIMEOUT_MS   — 每個 request timeout（預設 15000）
//   FIX_ENABLED  — "1" 啟用自動修復（預設 1）
//   CRON_SECRET  — 若 admin endpoint 要 secret header（Render dashboard 設定）

import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, "..", "logs");
const SERVICE = "daily-health-check";

const RENDER_BASE = (process.env.RENDER_BASE || "https://donttalk-catchall.onrender.com").replace(/\/+$/, "");
const VERCEL_BASE = (process.env.VERCEL_BASE || "https://donttalk.vercel.app").replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 15000);
const FIX_ENABLED = process.env.FIX_ENABLED !== "0";
const CRON_SECRET = process.env.CRON_SECRET || "";

const startedAt = new Date();
const isoNow = startedAt.toISOString();
const dateKey = isoNow.slice(0, 10); // YYYY-MM-DD
const logFile = join(LOGS_DIR, `health_${dateKey}.jsonl`);

// ──────────────── Test definitions ────────────────

/**
 * @typedef {Object} TestSpec
 * @property {string} id
 * @property {"tier1"|"tier2"|"tier3"} tier
 * @property {string} url
 * @property {string} method
 * @property {(json: any, raw: string) => { ok: boolean, error?: string, hint?: string }} check
 * @property {null | ((json: any) => boolean)} fix  // returns true if fix was attempted
 * @property {string} [desc]
 */

/** @type {TestSpec[]} */
const TESTS = [
  // ───── Tier 1: Render catchall 核心 API ─────
  {
    id: "t1_render_healthz",
    tier: "tier1",
    url: `${RENDER_BASE}/healthz`,
    method: "GET",
    check: (j) => j?.status === "ok" ? { ok: true } : { ok: false, error: `status=${j?.status}` },
    desc: "Render catchall 服務活著",
  },
  {
    id: "t1_stock_2330",
    tier: "tier1",
    url: `${RENDER_BASE}/api/stock/2330`,
    method: "GET",
    check: (j) => {
      if (!j?.candles?.length) return { ok: false, error: "no candles" };
      const last = j.candles[j.candles.length - 1];
      if (!last || typeof last.close !== "number") return { ok: false, error: "last candle no close" };
      return { ok: true };
    },
    desc: "個股 2330 K 線（FinMind price loader 健康）",
  },
  {
    id: "t1_damo",
    tier: "tier1",
    url: `${RENDER_BASE}/api/stock_damo_filter`,
    method: "GET",
    check: (j) => {
      const arr = j?.results || j?.items;
      if (!Array.isArray(arr)) return { ok: false, error: "no results array" };
      if (arr.length < 1) return { ok: false, error: `empty results (0 cards)`, hint: "needs refresh" };
      // 抽查第一筆的 has_* 旗標（至少要有 1 個 true）
      const first = arr[0];
      const hasFlags = ["short_buy","chan_to_bull","year_break_buy","dip_ma60_buy","dip_ma240_buy",
                       "ma60_touch_buy","bear_gate_sell","has_consol_buy","has_consol_sell",
                       "has_macd_div_sell","has_vcp","has_fib"].filter(k => first?.[k]);
      if (hasFlags.length === 0) {
        return { ok: true, hint: `${arr.length} cards but all has_* false on first item` };
      }
      return { ok: true };
    },
    fix: (j) => {
      const arr = j?.results || j?.items;
      if (!Array.isArray(arr) || arr.length < 1) return true;  // empty → fix
      return false;  // has data, no need to refresh
    },
    desc: "DAMO 篩選器",
  },
  {
    id: "t1_etf_signal",
    tier: "tier1",
    url: `${RENDER_BASE}/api/etf_signal_filter`,
    method: "GET",
    check: (j) => {
      const arr = j?.results || j?.items;
      if (!Array.isArray(arr)) return { ok: false, error: "no results array" };
      if (arr.length < 1) return { ok: false, error: "empty results", hint: "needs refresh" };
      return { ok: true };
    },
    fix: (j) => {
      const arr = j?.results || j?.items;
      return !Array.isArray(arr) || arr.length < 1;
    },
    desc: "ETF signal 篩選器",
  },
  {
    id: "t1_signal_filter",
    tier: "tier1",
    url: `${RENDER_BASE}/api/signal_filter`,
    method: "GET",
    check: (j) => {
      const arr = j?.results || j?.items;
      if (!Array.isArray(arr)) return { ok: false, error: "no results array" };
      if (arr.length < 1) return { ok: false, error: "empty results", hint: "needs refresh" };
      return { ok: true };
    },
    fix: (j) => {
      const arr = j?.results || j?.items;
      return !Array.isArray(arr) || arr.length < 1;
    },
    desc: "signal_filter 篩選器",
  },
  {
    id: "t1_macro",
    tier: "tier1",
    url: `${RENDER_BASE}/api/macro_data`,
    method: "GET",
    check: (j) => {
      if (!j || typeof j !== "object") return { ok: false, error: "empty object" };
      // 至少要有一些 macro 欄位
      if (Object.keys(j).length < 3) return { ok: false, error: `only ${Object.keys(j).length} keys` };
      return { ok: true };
    },
    desc: "macro 總經數據",
  },
  {
    id: "t1_markers_history",
    tier: "tier1",
    url: `${RENDER_BASE}/api/markers/history`,
    method: "GET",
    check: (j) => {
      const arr = j?.rows || j?.history || j?.items;
      if (!Array.isArray(arr)) return { ok: false, error: "no rows" };
      if (arr.length < 1) return { ok: false, error: "empty rows", hint: "needs intraday cron" };
      return { ok: true };
    },
    desc: "markers 歷史紀錄",
  },
  {
    id: "t1_uptrend_watch",
    tier: "tier1",
    url: `${RENDER_BASE}/api/uptrend_watch`,
    method: "GET",
    check: (j) => {
      if (!j) return { ok: false, error: "null" };
      const arr = j?.items || j?.results || j?.picks;
      if (Array.isArray(arr) && arr.length === 0) {
        return { ok: true, hint: "empty picks (acceptable)" };
      }
      return { ok: true };
    },
    desc: "uptrend watch 清單",
  },
  {
    id: "t1_warming_zone",
    tier: "tier1",
    url: `${RENDER_BASE}/api/warming_zone_scan`,
    method: "GET",
    check: (j) => {
      if (!j) return { ok: false, error: "null" };
      const arr = j?.items || j?.results;
      if (Array.isArray(arr) && arr.length === 0) {
        return { ok: true, hint: "empty warming (acceptable)" };
      }
      return { ok: true };
    },
    desc: "warming zone scan",
  },
  {
    id: "t1_etf_holdings_0050",
    tier: "tier1",
    url: `${RENDER_BASE}/api/etf_holdings/0050`,
    method: "GET",
    check: (j) => {
      if (!j) return { ok: false, error: "null" };
      if (j?.error) return { ok: false, error: j.error };
      if (j?.code && j.code !== "0050") return { ok: false, error: `wrong code ${j.code}` };
      if (!Array.isArray(j?.candles) || j.candles.length < 5) {
        return { ok: false, error: `candles=${j?.candles?.length || 0}` };
      }
      return { ok: true };
    },
    desc: "ETF 0050 持倉 + K 線（etf_holdings route）",
  },

  // ───── Tier 2: Vercel 站 HTML 頁 ─────
  {
    id: "t2_vercel_root",
    tier: "tier2",
    url: `${VERCEL_BASE}/`,
    method: "GET",
    check: (_j, raw) => {
      if (raw.length < 200) return { ok: false, error: `too small (${raw.length} bytes)` };
      if (raw.includes("<title>404") || raw.toLowerCase().includes("not found")) {
        return { ok: false, error: "404 page" };
      }
      return { ok: true };
    },
    desc: "Vercel 站根目錄",
  },
  {
    id: "t2_damo_page",
    tier: "tier2",
    url: `${VERCEL_BASE}/stock/stock-damo-filter/`,
    method: "GET",
    check: (_j, raw) => {
      if (raw.length < 1000) return { ok: false, error: `too small (${raw.length} bytes)` };
      if (raw.includes("<title>404")) return { ok: false, error: "404 page" };
      if (!raw.includes("DAMO") && !raw.includes("damo") && !raw.includes("stock-damo-filter")) {
        return { ok: false, error: "page content missing DAMO marker" };
      }
      return { ok: true };
    },
    desc: "DAMO filter 頁面",
  },
  {
    id: "t2_dashboard",
    tier: "tier2",
    url: `${VERCEL_BASE}/stock/dashboard/`,
    method: "GET",
    check: (_j, raw) => {
      if (raw.length < 1000) return { ok: false, error: `too small (${raw.length} bytes)` };
      if (raw.includes("<title>404")) return { ok: false, error: "404 page" };
      return { ok: true };
    },
    desc: "stock dashboard 頁面",
  },
  {
    id: "t2_etf_filter",
    tier: "tier2",
    url: `${VERCEL_BASE}/stock/etf-filter/`,
    method: "GET",
    check: (_j, raw) => {
      if (raw.length < 1000) return { ok: false, error: `too small (${raw.length} bytes)` };
      if (raw.includes("<title>404")) return { ok: false, error: "404 page" };
      return { ok: true };
    },
    desc: "ETF filter 頁面",
  },
  {
    id: "t2_signal_filter_v2",
    tier: "tier2",
    url: `${VERCEL_BASE}/stock/signal-filter-v2/`,
    method: "GET",
    check: (_j, raw) => {
      if (raw.length < 1000) return { ok: false, error: `too small (${raw.length} bytes)` };
      if (raw.includes("<title>404")) return { ok: false, error: "404 page" };
      return { ok: true };
    },
    desc: "signal filter v2 頁面",
  },
  {
    id: "t2_stock_index",
    tier: "tier2",
    url: `${VERCEL_BASE}/stock/`,
    method: "GET",
    check: (_j, raw) => {
      if (raw.length < 1000) return { ok: false, error: `too small (${raw.length} bytes)` };
      if (raw.includes("<title>404")) return { ok: false, error: "404 page" };
      return { ok: true };
    },
    desc: "stock 主索引",
  },
  {
    id: "t2_music",
    tier: "tier2",
    url: `${VERCEL_BASE}/music/`,
    method: "GET",
    check: (_j, raw) => {
      if (raw.length < 500) return { ok: false, error: `too small (${raw.length} bytes)` };
      if (raw.includes("<title>404")) return { ok: false, error: "404 page" };
      return { ok: true };
    },
    desc: "music 頁面",
  },

  // ───── Tier 3: admin 診斷 ─────
  {
    id: "t3_health_tables",
    tier: "tier3",
    url: `${RENDER_BASE}/api/admin/health/tables`,
    method: "GET",
    check: (j) => {
      if (!j) return { ok: false, error: "null" };
      if (!j?.tables && !j?.rows) return { ok: false, error: "no tables/rows field" };
      return { ok: true };
    },
    desc: "DB 各表 row count 健康度",
  },
  {
    id: "t3_markers_backup",
    tier: "tier3",
    url: `${RENDER_BASE}/api/admin/markers/backup`,
    method: "GET",
    check: (j) => {
      const arr = j?.rows || j?.markers;
      if (!Array.isArray(arr)) return { ok: false, error: "no rows" };
      if (arr.length < 1) return { ok: false, error: "empty markers (needs load_all)", hint: "load_all" };
      return { ok: true };
    },
    fix: (j) => {
      const arr = j?.rows || j?.markers;
      return !Array.isArray(arr) || arr.length < 1;
    },
    desc: "markers 備份（含 load_all 觸發判斷）",
  },
];

// ──────────────── Helpers ────────────────

async function fetchWithTimeout(url, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const resp = await fetch(url, { ...opts, signal: ctl.signal, headers: { "User-Agent": "daily-health-check/1.0", ...(opts.headers || {}) } });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep null */ }
    return { ok: resp.ok, status: resp.status, json, raw: text, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, status: 0, json: null, raw: "", latencyMs: Date.now() - start, error: e?.name === "AbortError" ? "timeout" : (e?.message || String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(url, body) {
  return fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(CRON_SECRET ? { "X-Cron-Secret": CRON_SECRET } : {}) },
    body: JSON.stringify(body),
  });
}

async function runTest(t) {
  const r = await fetchWithTimeout(t.url, { method: t.method });
  /** @type {{ ok: boolean, error?: string, hint?: string }} */
  let verdict = { ok: false, error: `http ${r.status}` };
  if (r.ok) {
    try {
      verdict = t.check(r.json, r.raw) || { ok: false, error: "check returned falsy" };
    } catch (e) {
      verdict = { ok: false, error: `check threw: ${e?.message}` };
    }
  }

  let fix = null;
  if (!verdict.ok && FIX_ENABLED && t.fix) {
    const needsFix = t.fix(r.json);
    if (needsFix) {
      const fixUrl = {
        "t1_damo": `${RENDER_BASE}/api/stock_damo_filter/refresh`,
        "t1_etf_signal": `${RENDER_BASE}/api/etf_signal_filter/refresh`,
        "t1_signal_filter": `${RENDER_BASE}/api/signal_filter/refresh`,
        "t3_markers_backup": `${RENDER_BASE}/api/admin/load/all`,
      }[t.id];
      if (fixUrl) {
        const fr = await postJson(fixUrl, { trigger: "daily-health-check" });
        fix = {
          attempted: true,
          url: fixUrl,
          status: fr.status,
          ok: fr.ok,
        };
        if (fr.ok) {
          verdict = { ...verdict, ok: true, hint: (verdict.hint || "") + ` [auto-fixed by POST]` };
        }
      }
    }
  }

  return {
    id: t.id,
    tier: t.tier,
    desc: t.desc,
    url: t.url,
    method: t.method,
    http_status: r.status,
    latency_ms: r.latencyMs,
    ok: verdict.ok,
    error: verdict.error || null,
    hint: verdict.hint || null,
    fix,
    checked_at: new Date().toISOString(),
  };
}

// ──────────────── Main ────────────────

async function main() {
  console.log(`[${SERVICE} ${isoNow}] start`);
  console.log(`  RENDER_BASE=${RENDER_BASE}`);
  console.log(`  VERCEL_BASE=${VERCEL_BASE}`);
  console.log(`  FIX_ENABLED=${FIX_ENABLED}  TIMEOUT_MS=${TIMEOUT_MS}`);
  console.log(`  logFile=${logFile}`);

  if (!existsSync(LOGS_DIR)) await mkdir(LOGS_DIR, { recursive: true });

  // 分批跑（Render free plan 連線有限，concurrency 4 是甜蜜點）
  const tier1 = TESTS.filter(t => t.tier === "tier1");
  const tier2 = TESTS.filter(t => t.tier === "tier2");
  const tier3 = TESTS.filter(t => t.tier === "tier3");
  const CONCURRENCY = 4;

  const runBatch = async (group) => {
    const out = [];
    for (let i = 0; i < group.length; i += CONCURRENCY) {
      const slice = group.slice(i, i + CONCURRENCY);
      const r = await Promise.all(slice.map(runTest));
      out.push(...r);
    }
    return out;
  };

  const results = [];
  for (const group of [tier1, tier2, tier3]) {
    const r = await runBatch(group);
    results.push(...r);
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const fixed = results.filter(r => r.fix?.attempted && r.fix?.ok).length;

  const summary = {
    service: SERVICE,
    started_at: isoNow,
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    total: results.length,
    passed,
    failed,
    auto_fixed: fixed,
    tier1_pass: results.filter(r => r.tier === "tier1" && r.ok).length,
    tier1_total: tier1.length,
    tier2_pass: results.filter(r => r.tier === "tier2" && r.ok).length,
    tier2_total: tier2.length,
    tier3_pass: results.filter(r => r.tier === "tier3" && r.ok).length,
    tier3_total: tier3.length,
    failures: results.filter(r => !r.ok).map(r => ({ id: r.id, error: r.error, status: r.http_status })),
  };

  // 寫 log
  const line = JSON.stringify({ ...summary, results }) + "\n";
  try {
    await writeFile(logFile, line, { flag: "a" });
    console.log(`[${SERVICE}] log appended: ${logFile}`);
  } catch (e) {
    console.error(`[${SERVICE}] log write FAIL: ${e?.message}`);
  }

  // 寫 latest summary
  const latestFile = join(LOGS_DIR, "health_latest.json");
  try {
    await writeFile(latestFile, JSON.stringify(summary, null, 2));
  } catch (e) {
    console.error(`[${SERVICE}] latest write FAIL: ${e?.message}`);
  }

  // POST 到 /admin/health/record 寫入 Neon（dashboard / Vercel catchall 都能讀）
  //   - 失敗不影響 cron 結束（本地 log 已經有）
  //   - 用 30s timeout（Render 第一次 request 冷啟動可能慢）
  try {
    const recordUrl = `${RENDER_BASE}/api/admin/health/record`;
    const recordBody = {
      ...summary,
      trigger: "daily-health-check",
      failures: summary.failures,
    };
    const rec = await postJson(recordUrl, recordBody);
    if (rec.ok) {
      console.log(`[${SERVICE}] recorded to Neon: ${recordUrl}  http=${rec.status}`);
    } else {
      console.error(`[${SERVICE}] record FAIL: http=${rec.status} raw=${(rec.raw || "").slice(0, 200)}`);
    }
  } catch (e) {
    console.error(`[${SERVICE}] record exception: ${e?.message}`);
  }

  console.log(`[${SERVICE}] result: pass=${passed}/${results.length}  fail=${failed}  fixed=${fixed}`);
  if (failed > 0) {
    console.log(`[${SERVICE}] failures:`);
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  - ${r.id}: ${r.error}  [http ${r.http_status}]  fix=${r.fix?.attempted ? (r.fix.ok ? "ok" : "fail") : "none"}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`[${SERVICE}] FATAL: ${e?.message}`);
  console.error(e?.stack);
  process.exit(2);
});
