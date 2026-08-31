const https = require('https');

function test(name, opts, body) {
  return new Promise((resolve) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data.slice(0, 200); }
        console.log(`\n=== ${name} ===`);
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response:`, typeof parsed === 'object' ? JSON.stringify(parsed).slice(0, 500) : parsed);
        resolve();
      });
    });
    req.on('error', e => { console.log(`\n=== ${name} ===\nError: ${e.message}`); resolve(); });
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  // 1. AI Warroom
  await test('AI Warroom', {
    hostname: 'donttalk.vercel.app', port: 443,
    path: '/api/ai/warroom', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ query: 'MACD 剛轉正且量增' }));

  // 2. Ranking
  await test('Ranking', {
    hostname: 'donttalk.vercel.app', port: 443,
    path: '/api/ranking?scope=all&limit=5', method: 'GET'
  });

  // 3. Futures (TX)
  await test('Futures TX', {
    hostname: 'donttalk.vercel.app', port: 443,
    path: '/api/futures/TX/kline?interval=D', method: 'GET'
  });

  // 4. Treasury buyback
  await test('Buyback', {
    hostname: 'donttalk.vercel.app', port: 443,
    path: '/api/treasury/buyback', method: 'GET'
  });

  // 5. Chat (chat proxy)
  await test('Chat proxy', {
    hostname: 'donttalk.vercel.app', port: 443,
    path: '/api/chat', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ message: '你好' }));
})();