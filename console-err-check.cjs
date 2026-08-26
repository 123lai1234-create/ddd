// Capture all console messages + errors from current browser tab
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

async function getTargets() {
  return new Promise((resolve) => {
    http.get('http://localhost:9222/json', res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
  });
}

(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));

  const messages = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.exceptionThrown') {
      const text = msg.params.args ? msg.params.args.map(a => a.value || a.description || '').join(' ') : (msg.params.exceptionDetails?.text || '');
      messages.push({ type: msg.method, text: text.substring(0, 200) });
    }
  });

  // Enable runtime + collect for 12s
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  await new Promise((r) => setTimeout(r, 12000));

  // Navigate to dashboard
  ws.send(JSON.stringify({ id: 2, method: 'Page.navigate', params: { url: 'https://donttalk.vercel.app/stock-app/dashboard?cb=' + Date.now() } }));
  await new Promise((r) => setTimeout(r, 15000));

  // Navigate to heatmap
  ws.send(JSON.stringify({ id: 3, method: 'Page.navigate', params: { url: 'https://donttalk.vercel.app/stock-app/heatmap?cb=' + Date.now() } }));
  await new Promise((r) => setTimeout(r, 10000));

  // revenue
  ws.send(JSON.stringify({ id: 4, method: 'Page.navigate', params: { url: 'https://donttalk.vercel.app/stock-app/revenue?cb=' + Date.now() } }));
  await new Promise((r) => setTimeout(r, 10000));

  // signal-filter
  ws.send(JSON.stringify({ id: 5, method: 'Page.navigate', params: { url: 'https://donttalk.vercel.app/stock-app/signal-filter?cb=' + Date.now() } }));
  await new Promise((r) => setTimeout(r, 10000));

  // warming
  ws.send(JSON.stringify({ id: 6, method: 'Page.navigate', params: { url: 'https://donttalk.vercel.app/stock-app/warming?cb=' + Date.now() } }));
  await new Promise((r) => setTimeout(r, 10000));

  // admin_logs
  ws.send(JSON.stringify({ id: 7, method: 'Page.navigate', params: { url: 'https://donttalk.vercel.app/stock-app/admin_logs?cb=' + Date.now() } }));
  await new Promise((r) => setTimeout(r, 10000));

  // index (back to start)
  ws.send(JSON.stringify({ id: 8, method: 'Page.navigate', params: { url: 'https://donttalk.vercel.app/stock-app/index.html?cb=' + Date.now() } }));
  await new Promise((r) => setTimeout(r, 15000));

  // Filter non-trivial errors
  const real = messages.filter(m => {
    const t = m.text;
    if (!t) return false;
    if (t.includes('Built-In AI')) return false;
    if (t.includes('LanguageDetector')) return false;
    if (t.includes('Submit feedback')) return false;
    if (t.includes('chrome-extension')) return false;
    return true;
  });
  console.log('All console events captured:', messages.length);
  console.log('Real issues found (incl warnings):', real.length);
  real.slice(0, 30).forEach(m => console.log(`  [${m.type.replace('Runtime.','')}] ${m.text.substring(0, 250)}`));
  fs.writeFileSync('D:\\project\\console-errors.json', JSON.stringify(messages, null, 2));
  ws.close();
  process.exit(0);
})();
