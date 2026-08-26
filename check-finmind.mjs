// Verify FinMind loader endpoints respond correctly (no token = 503 fallback)
for (const ep of ['/api/admin/load/big_holders/finmind', '/api/admin/load/financial_reports/finmind']) {
  const r = await fetch('https://donttalk.vercel.app' + ep);
  const t = await r.text();
  console.log(ep, r.status, t.slice(0, 200));
}
