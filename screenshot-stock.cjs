// Take screenshot using CJS
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

(async () => {
  const targets = await new Promise((resolve) => {
    http.get('http://localhost:9222/json', res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
  });
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  await new Promise((resolve) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id === 1) {
        const out = 'D:\\project\\stock-screenshot.png';
        fs.writeFileSync(out, Buffer.from(msg.result.data, 'base64'));
        console.log('saved:', out, 'size:', fs.statSync(out).size);
        resolve();
      }
    });
  });
  ws.close();
  process.exit(0);
})();
