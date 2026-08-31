const https = require('https');

const data = JSON.stringify({ message: 'Hi' });
const u = new URL('https://donttalk.vercel.app/api/chat');
const req = https.request({
  hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  timeout: 60000
},
  (res) => {
    let body = '';
    res.on('data', (c) => body += c);
    res.on('end', () => console.log(`Status: ${res.statusCode}, time: ${res.headers['x-vercel-id']}\n${body.slice(0, 300)}`));
  }
);
req.on('error', e => console.error('Error:', e.message));
req.on('timeout', () => { req.destroy(); console.error('TIMEOUT'); });
req.write(data);
req.end();