const https = require('https');

const BATCH = process.argv[2] || '1';
const BATCH_SIZE = 5;

const ALL = [
  ['healthz', '/api/healthz'],
  ['overseas', '/api/overseas'],
  ['macro_data', '/api/macro_data'],
  ['heatmap', '/api/heatmap'],
  ['markers_history', '/api/markers/history?days=1'],
  ['stocks', '/api/stocks'],
  ['institutional', '/api/institutional/2330?days=3'],
  ['stock_klines', '/api/stock/2330?days=30'],
  ['stock_events', '/api/stock/2330/events?days=30'],
  ['exdiv_upcoming', '/api/exdiv/upcoming?days=30'],
  ['exdiv_calendar', '/api/exdiv/calendar?days=30'],
  ['chat', 'POST', '/api/chat', '{"message":"測試"}'],
  ['ai_warroom', 'POST', '/api/ai/warroom', '{"query":"MACD 轉正"}'],
  ['ranking', '/api/ranking?limit=5'],
  ['futures_TX', '/api/futures/TX/kline?interval=D'],
  ['treasury_buyback', '/api/treasury/buyback'],
  ['treasury_private', '/api/treasury/private'],
  ['yahoo_proxy', '/api/yahoo/chart?symbol=DX-Y.NYB&interval=1d&range=1d'],
  ['recipients', '/api/recipients'],
  ['warming_zone_scan', '/api/warming_zone_scan'],
  ['pe_threshold', '/api/pe_threshold'],
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
      timeout: 6000,
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
  const start = (Number(BATCH) - 1) * BATCH_SIZE;
  const slice = ALL.slice(start, start + BATCH_SIZE);
  for (const ep of slice) {
    const method = ep[1] === 'POST' ? 'POST' : 'GET';
    const path = ep[ep.length - 1];
    const body = ep[1] === 'POST' ? ep[2] : null;
    const label = ep[0];
    const r = await fetchUrl(`https://donttalk.vercel.app${path}`, method, body);
    let parsed;
    try { parsed = JSON.parse(r.body); } catch { parsed = r.body.slice(0, 120); }
    const preview = typeof parsed === 'object' ? JSON.stringify(parsed).slice(0, 200) : String(parsed).slice(0, 100);
    const icon = r.status >= 200 && r.status < 400 ? '✓' : '✗';
    console.log(`${icon} [${r.status}] ${label.padEnd(20)} ${preview}`);
  }
})();