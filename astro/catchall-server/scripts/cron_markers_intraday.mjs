#!/usr/bin/env node
// Render cron job — intraday markers refresh (every 30 min during market hours)
// Hits https://donttalk-catchall.onrender.com/admin/markers/intraday
// 只 refresh 不 cleanup（cleanup 在收盤後 14:30 那次做）
//
// Schedule UTC: */30 1-5 * * 1-5
//   = 每 30 分鐘、UTC 01:00-05:59、週一至週五
//   = Asia/Taipei 09:00-13:59（涵蓋台股盤中 09:00-13:30）

const url = process.env.MAINTENANCE_URL
  ? process.env.MAINTENANCE_URL.replace('/maintenance', '/intraday')
  : 'https://donttalk-catchall.onrender.com/admin/markers/intraday';
const timeoutMs = Number(process.env.TIMEOUT_MS || 120000);

const startedAt = new Date().toISOString();
console.log(`[intraday-cron ${startedAt}] POST ${url}`);

const ctl = new AbortController();
const timer = setTimeout(() => ctl.abort(), timeoutMs);

try {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'render-cron/markers-intraday' },
    body: JSON.stringify({ trigger: 'render-cron-intraday', triggered_at: startedAt }),
    signal: ctl.signal,
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  console.log(`[intraday-cron] ok=${resp.ok} status=${resp.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!resp.ok) process.exit(1);
} catch (e) {
  console.error(`[intraday-cron] FAIL: ${e?.name} ${e?.message}`);
  process.exit(2);
} finally {
  clearTimeout(timer);
}