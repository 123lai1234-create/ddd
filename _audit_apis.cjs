const https = require('https');

const API_ENDPOINTS = [
  { path: '/api/healthz', label: 'healthz' },
  { path: '/api/overseas', label: 'overseas' },
  { path: '/api/macro_data', label: 'macro_data' },
  { path: '/api/heatmap', label: 'heatmap' },
  { path: '/api/markers/history?days=1', label: 'markers history' },
  { path: '/api/stocks', label: 'stocks' },
  { path: '/api/institutional/2330?days=3', label: 'institutional' },
  { path: '/api/stock/2330?days=30', label: 'stock klines' },
  { path: '/api/stock/2330/events?days=30', label: 'stock events' },
  { path: '/api/exdiv/upcoming?days=30', label: 'exdiv upcoming' },
  { path: '/api/exdiv/calendar?days=30', label: 'exdiv calendar' },
  { path: '/api/chat', method: 'POST', body: '{"message":"測試"}', label: 'chat (MiniMax)' },
  { path: '/api/ai/warroom', method: 'POST', body: '{"query":"MACD 轉正"}', label: 'AI warroom' },
  { path: '/api/ranking?limit=5', label: 'ranking' },
  { path: '/api/futures/TX/kline?interval=D', label: 'futures TX' },
  { path: '/api/treasury/buyback', label: 'treasury buyback' },
  { path: '/api/treasury/private', label: 'private placement' },
  { path: '/api/yahoo/chart?symbol=DX-Y.NYB&interval=1d&range=1d', label: 'yahoo chart proxy' },
  { path: '/api/recipients', label: 'recipients' },
  { path: '/api/warming_zone_scan', label: 'warming_zone_scan' },
  { path: '/api/pe_threshold', label: 'pe_threshold' },
  { path: '/api/yahoo/chart?symbol=GC=F&interval=1d&range=1d', label: 'yahoo gold' },
  { path: '/api/yahoo/chart?symbol=USDTWD=X&interval=1d&range=1mo', label: 'yahoo USDTWD' },
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
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log('=== API ENDPOINTS ===\n');
  for (const ep of API_ENDPOINTS) {
    const url = `https://donttalk.vercel.app${ep.path}`;
    const r = await fetchUrl(url, ep.method, ep.body);
    let parsed;
    try { parsed = JSON.parse(r.body); } catch { parsed = r.body.slice(0, 120); }
    const preview = typeof parsed === 'object' ? JSON.stringify(parsed).slice(0, 200) : String(parsed).slice(0, 100);
    const icon = r.status >= 200 && r.status < 400 ? '✓' : '✗';
    console.log(`${icon} [${r.status}] ${ep.label.padEnd(25)} ${preview}`);
  }
})();