// Trigger all 12 cron loaders and report status
const endpoints = [
  '/api/admin/load/institutional',
  '/api/admin/load/exdiv',
  '/api/admin/load/revenue?typeks=sii',
  '/api/admin/load/futures',
  '/api/admin/load/overseas',
  '/api/admin/load/ai_capex',
  '/api/admin/load/market_prices',
  '/api/admin/load/macro_yields',
  '/api/admin/load/macro_news',
  '/api/admin/load/index_institutional',
  '/api/admin/load/markers',
  '/api/admin/load/sectors',
];

const base = 'https://donttalk.vercel.app';

const results = [];
for (const ep of endpoints) {
  const t0 = Date.now();
  try {
    const r = await fetch(base + ep, { method: 'GET', signal: AbortSignal.timeout(55000) });
    const dt = Date.now() - t0;
    const text = await r.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    const ok = parsed?.ok ?? (r.status === 200);
    const count = parsed?.count ?? parsed?.inserted ?? parsed?.updated ?? parsed?.total;
    const err = parsed?.error;
    results.push({ ep, status: r.status, dt, ok, count, err: err ? String(err).slice(0, 100) : null });
  } catch (e) {
    results.push({ ep, status: 'TIMEOUT', dt: Date.now() - t0, err: e.message });
  }
}
console.log('ep'.padEnd(45), 'status', 'ms', 'ok', 'count/error');
for (const r of results) {
  console.log(r.ep.padEnd(45), String(r.status).padEnd(8), String(r.dt).padEnd(5), String(r.ok ?? '-').padEnd(5), r.count ?? r.err ?? '-');
}
