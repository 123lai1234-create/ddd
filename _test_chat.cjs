const http = require('http');
const https = require('https');

const data = JSON.stringify({ message: '你好' });
const url = new URL('https://donttalk-api.fly.dev/api/chat');
const lib = url.protocol === 'https:' ? https : http;

const req = lib.request({
  hostname: url.hostname,
  port: url.port,
  path: url.pathname,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', body);
  });
});
req.on('error', e => console.error('Error:', e.message));
req.write(data);
req.end();
