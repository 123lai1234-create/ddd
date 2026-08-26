// Debug 4 endpoints — check what they return now
const base = 'https://donttalk.vercel.app';
for (const ep of ['/api/etf_filter', '/api/etf_diff?code=0050', '/api/marker_history', '/api/strategy_signals', '/api/markers/history', '/api/etf_holdings/filter']) {
  try {
    const r = await fetch(base + ep, { signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    const cnt = j?.count ?? j?.items?.length ?? j?.rows?.length ?? j?.history?.length ?? '?';
    const sample = j?.items?.[0] || j?.rows?.[0] || j?.history?.[0] || j?.data?.[0] || null;
    console.log(`${ep.padEnd(40)}  ${r.status}  count=${cnt}  sample=${sample ? JSON.stringify(sample).slice(0, 100) : '(none)'}`);
  } catch (e) { console.log(`${ep.padEnd(40)}  ERR: ${e.message}`); }
}
