const tests = ['stocks','stock/2330','stock/2330/intro','stock/2330/etf_membership','stock/2330/events','heatmap','revenue','macro','signal-filter','admin_logs','warming','sold-too-early','uptrend-watch','price-compare','ai-capex','sitemap'];
(async () => {
  for (const t of tests) {
    const r = await fetch('https://donttalk.vercel.app/api/' + t + '?cb=' + Date.now(), { cache: 'no-store' });
    const x = await r.text();
    console.log(t, '=', r.status, x.length > 200 ? 'OK len=' + x.length : x.substring(0, 60));
  }
})();
