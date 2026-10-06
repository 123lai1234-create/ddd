#!/usr/bin/env node
// Render cron job — daily markers maintenance
// Hits https://donttalk-catchall.onrender.com/admin/markers/maintenance
// which:
//   1. DELETEs placeholder markers (x/test/empty)
//   2. Re-runs screener + inserts fresh real markers
//
// Triggered by Render cron at 06:30 UTC = 14:30 Asia/Taipei (after market close)
// Environment:
//   MAINTENANCE_URL  full URL to the maintenance endpoint (default: catchall prod)

const url = process.env.MAINTENANCE_URL || 'https://donttalk-catchall.onrender.com/admin/markers/maintenance';
const timeoutMs = Number(process.env.TIMEOUT_MS || 180000); // 3 min, scanAll can be slow on cold start

const startedAt = new Date().toISOString();
console.log(`[markers-cron ${startedAt}] POST ${url}`);

const ctl = new AbortController();
const timer = setTimeout(() => ctl.abort(), timeoutMs);

try {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'render-cron/markers-maintenance' },
    body: JSON.stringify({ trigger: 'render-cron', triggered_at: startedAt }),
    signal: ctl.signal,
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  console.log(`[markers-cron] ok=${resp.ok} status=${resp.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!resp.ok) process.exit(1);
} catch (e) {
  console.error(`[markers-cron] FAIL: ${e?.name} ${e?.message}`);
  process.exit(2);
} finally {
  clearTimeout(timer);
}