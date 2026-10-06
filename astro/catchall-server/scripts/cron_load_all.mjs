#!/usr/bin/env node
// Render cron job — daily 06:00 UTC = 14:00 Asia/Taipei（收盤後）
// 跑 loadAllCombined：macro_yields → macro_news → index_institutional →
// market_prices → sectors → markers → ai_capex。整個 macro + 個股 + 訊號都更新。
//
// 環境變數：
//   MAINTENANCE_URL — catchall 上要打的 endpoint（會自動在後面加 /load_all）
//   TIMEOUT_MS      — request timeout（預設 240s，loadAll 含 6+ 個 loader 可能慢）

const base = process.env.MAINTENANCE_URL || 'https://donttalk-catchall.onrender.com';
const url = base.replace(/\/+$/, '') + '/admin/load/all';
const timeoutMs = Number(process.env.TIMEOUT_MS || 240000);

const startedAt = new Date().toISOString();
console.log(`[load-all-cron ${startedAt}] POST ${url}`);

const ctl = new AbortController();
const timer = setTimeout(() => ctl.abort(), timeoutMs);

try {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'render-cron/load-all' },
    body: JSON.stringify({ trigger: 'render-cron', triggered_at: startedAt }),
    signal: ctl.signal,
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  console.log(`[load-all-cron] ok=${resp.ok} status=${resp.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!resp.ok) process.exit(1);
} catch (e) {
  console.error(`[load-all-cron] FAIL: ${e?.name} ${e?.message}`);
  process.exit(2);
} finally {
  clearTimeout(timer);
}