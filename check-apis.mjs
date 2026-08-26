// Health check on key API endpoints used by stock-app
const base = 'https://donttalk.vercel.app';
const apis = [
  ['/api/heatmap',                       'GET',  null],
  ['/api/macro_data',                    'GET',  null],
  ['/api/macro/yield/2y_history',        'GET',  null],
  ['/api/pe_threshold',                  'GET',  null],
  ['/api/price_compare',                 'GET',  null],
  ['/api/warming_zone_scan',             'GET',  null],
  ['/api/sold_too_early',                'GET',  null],
  ['/api/ai_capex',                      'GET',  null],
  ['/api/marker_history',                'GET',  null],
  ['/api/etf',                           'GET',  null],
  ['/api/etf_holdings/0050',             'GET',  null],
  ['/api/etf_holdings/00878',            'GET',  null],
  ['/api/etf_holdings/00918',            'GET',  null],
  ['/api/etf_holdings/analyze',          'GET',  null],
  ['/api/etf_holdings/diff/0050',        'GET',  null],
  ['/api/big_holder_low_base',           'GET',  null],
  ['/api/index_institutional',           'GET',  null],
  ['/api/overseas',                      'GET',  null],
  ['/api/futures',                       'GET',  null],
  ['/api/exdiv',                         'GET',  null],
  ['/api/revenue',                       'GET',  null],
  ['/api/revenue/2330',                  'GET',  null],
  ['/api/news/2330',                     'GET',  null],
  ['/api/conference/2330',               'GET',  null],
  ['/api/financial/2330',                'GET',  null],
  ['/api/margin_burst/2330',             'GET',  null],
  ['/api/stock/2330',                    'GET',  null],
  ['/api/index/^TWII',                   'GET',  null],
  ['/api/stock_klines?code=2330',        'GET',  null],
  ['/api/etf_signal_filter',             'GET',  null],
  ['/api/etf_diff?code=0050',            'GET',  null],
];

console.log('endpoint'.padEnd(48), 'st', 'ms', 'ok', 'shape');
for (const [ep, m, body] of apis) {
  const t0 = Date.now();
  try {
    const r = await fetch(base + ep, { method: m, signal: AbortSignal.timeout(25000) });
    const dt = Date.now() - t0;
    const text = await r.text();
    let parsed = null; let shape = '?';
    try {
      parsed = JSON.parse(text);
      shape = Object.keys(parsed).join(',').slice(0, 40);
    } catch { shape = text.slice(0, 40); }
    const ok = parsed?.ok ?? (r.status === 200);
    console.log(ep.padEnd(48), String(r.status).padEnd(4), String(dt).padEnd(5), String(ok).padEnd(5), shape);
  } catch (e) {
    console.log(ep.padEnd(48), 'ERR', String(Date.now()-t0).padEnd(5), '-', e.message.slice(0, 40));
  }
}
