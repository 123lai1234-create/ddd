const http = require('http');
const WebSocket = require('ws');

(async () => {
  const targets = await new Promise((resolve) => {
    http.get('http://localhost:9222/json', res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
  });
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  const code = "JSON.stringify({candleAuto: typeof candleSeries.options().autoscaleInfoProvider, ma5: typeof ma5Line.options().autoscaleInfoProvider, support: typeof supportLine.options().autoscaleInfoProvider, ch: typeof channelHighLine.options().autoscaleInfoProvider, chLo: typeof channelLowLine.options().autoscaleInfoProvider, ma20: typeof ma20Line.options().autoscaleInfoProvider, ma60: typeof ma60Line.options().autoscaleInfoProvider, ma240: typeof ma240Line.options().autoscaleInfoProvider, ma10: typeof ma10Line.options().autoscaleInfoProvider})";
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: code, returnByValue: true } }));
  await new Promise((resolve) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id === 1) {
        console.log('Result:', msg.result.result.value);
        resolve();
      }
    });
  });
  ws.close();
  process.exit(0);
})();
