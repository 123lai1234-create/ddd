const https = require('https');

const APIS = [
  { label: 'stocks', path: '/api/stocks' },
  { label: 'institutional', path: '/api/institutional/2330?days=3' },
  { label: 'stock_klines', path: '/api/stock/2330?days=30' },
  { label: 'stock_events', path: '/api/stock/2330/events?days=30' },
  { label: 'exdiv_calendar', path: '/api/exdiv/calendar?days=30' },
  { label: 'exdiv_upcoming', path: '/api/exdiv/upcoming?days=30' },
  { label: 'ai_warroom', path: '/api/ai/warroom', method: 'POST', body: '{"query":"MACD 轉正"}' },
  { label: 'chat', path: '/api/chat', method: 'POST', body: '{"message":"測試"}' },
  { label: 'ranking', path: '/api/ranking?limit=5' },
  { label: 'futures_TX', path: '/api/futures/TX/kline?interval=D' },
  { label: 'treasury_buyback', path: '/api/treasury/buyback' },
  { label: 'treasury_private', path: '/api/treasury/private' },
  { label: 'yahoo_proxy', path: '/api/yahoo/chart?symbol=DX-Y.NYB&interval=1d&range=1d' },
  { label: 'recipients', path: '/api/recipients' },
  { label: 'warming_zone_scan', path: '/api/warming_zone_scan' },
  { label: 'pe_threshold', path: '/api/pe_threshold' },
  { label: 'heatmap', path: '/api/heatmap' },
  { label: 'markers_history', path: '/api/markers/history?days=1' },
  { label: 'macro_data', path: '/api/macro_data' },
  { label: 'pe_threshold2', path: '/api/signal_filter?limit=5' },
  { label: 'macro_news', path: '/api/macro_news' },
];

function fetchUrl(url, method, body) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
      timeout: 8000,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data, time: Date.now() }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message, time: Date.now() }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout', time: Date.now() }); });
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  let ok = 0, bad = 0;
  for (const ep of APIS) {
    const method = ep.method || 'GET';
    const t0 = Date.now();
    const r = await fetchUrl(`https://donttalk.vercel.app${ep.path}`, method, ep.body);
    const dur = Date.now() - t0;
    let parsed;
    try { parsed = JSON.parse(r.body); } catch { parsed = r.body.slice(0, 80); }
    const preview = typeof parsed === 'object' ? JSON.stringify(parsed).slice(0, 130) : String(parsed).slice(0, 80);
    if (r.status >= 200 && r.status < 400) ok++; else bad++;
    const icon = r.status >= 200 && r.status < 400 ? '✓' : '✗';
    console.log(`${icon} [${r.status}] ${dur}ms ${ep.label.padEnd(20)} ${preview}`);
  }
  console.log(`\nSummary: ${ok} OK, ${bad} broken`);
})();