const https = require('https');
const u = new URL('https://donttalk.vercel.app/api/markers/history?days=1');
const req = https.request({
  hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET', timeout: 60000
}, (res) => {
  let body = '';
  res.on('data', (c) => body += c);
  res.on('end', () => console.log(`Status: ${res.statusCode}\n${body.slice(0, 400)}`));
});
req.on('error', e => console.error('Error:', e.message));
req.on('timeout', () => { req.destroy(); console.error('TIMEOUT'); });
req.end();