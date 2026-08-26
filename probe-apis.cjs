// Comprehensive API health check for stock-app endpoints
const https = require('https');
const tests = [
  // [method, path, description]
  ["GET", "/api/healthz", "healthz"],
  ["GET", "/api/stocks", "stocks list"],
  ["GET", "/api/stocks/remove/2330", "remove stock (GET, should 405)"],
  ["GET", "/api/stock/2330?days=120", "stock 2330 klines"],
  ["GET", "/api/stock/2330/events?days=120", "stock 2330 events/markers"],
  ["GET", "/api/stock/2330/intro", "stock 2330 intro"],
  ["GET", "/api/stock/2330/etf_membership", "stock 2330 etf membership"],
  ["GET", "/api/markers/history?code=2330&days=30", "markers history 2330"],
  ["GET", "/api/markers/1", "marker by id (should 400 invalid id)"],
  ["GET", "/api/markers/abc", "marker by id (invalid)"],
  ["POST", "/api/markers/record", "markers record (no body, should 400)"],
  ["POST", "/api/markers/record", "markers record (batch mode no pwd)", "BATCH_TEST"],
  ["GET", "/api/position_history?days=30", "position history"],
  ["GET", "/api/institutional/2330?days=5", "institutional 2330"],
  ["GET", "/api/index/^TWII", "index ^TWII"],
  ["GET", "/api/index/^TWII", "index ^TWII 2nd"],
  ["GET", "/api/market_gaps?lookback=60&min_gap=0.3", "market gaps"],
  ["GET", "/api/fibonacci/2330?window=60", "fibonacci 2330"],
  ["GET", "/api/financial/2330", "financial 2330"],
  ["GET", "/api/news/2330?limit=10", "news 2330"],
  ["GET", "/api/news/market", "news market"],
  ["GET", "/api/macro_news", "macro news"],
  ["GET", "/api/macro_data", "macro data"],
  ["GET", "/api/macro_yield2y_history", "macro yield2y history"],
  ["GET", "/api/markers/batch_scan/status", "markers batch_scan status"],
  ["GET", "/api/stock_news_scan/quota", "stock news scan quota"],
  ["GET", "/api/stock_news_scan?code=2330&limit=5", "stock news scan"],
  ["GET", "/api/conference?watch_only=1", "conference (watch only)"],
  ["GET", "/api/recipients", "recipients list"],
  ["GET", "/api/admin/logs", "admin logs"],
];

function req(method, path, body) {
  return new Promise((resolve) => {
    const opts = {
      method,
      hostname: 'donttalk.vercel.app',
      path,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const r = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    r.on('error', (e) => resolve({ status: 0, data: e.message }));
    r.setTimeout(15000, () => { r.destroy(new Error('timeout')); });
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  for (const t of tests) {
    const [method, path, desc, tag] = t;
    const body = tag === 'BATCH_TEST'
      ? JSON.stringify({ code: "9999", items: [{ time: 1786406400, text: "PROBE_TEST", source: "auto" }] })
      : null;
    const r = await req(method, path, body);
    const isErr = r.status >= 500 || r.status === 0;
    const marker = isErr ? '❌' : (r.status >= 400 ? '⚠️ ' : '✅');
    let preview = '';
    try {
      const j = JSON.parse(r.data);
      preview = (j.ok !== undefined ? `ok=${j.ok}` : '') + (j.error ? ` err="${j.error}"` : '') + (j.count !== undefined ? ` count=${j.count}` : '');
    } catch (e) {
      preview = r.data.slice(0, 80);
    }
    console.log(`${marker} ${method.padEnd(4)} ${path.padEnd(60)} ${r.status} | ${desc} | ${preview}`);
  }
})();