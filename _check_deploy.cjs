const https = require('https');
const url = new URL('https://donttalk.vercel.app/about');
const req = https.request({ hostname: url.hostname, path: url.pathname, method: 'HEAD' }, (res) => {
  console.log('Status:', res.statusCode);
  console.log('X-Vercel-Id:', res.headers['x-vercel-id']);
  console.log('Cache-Control:', res.headers['cache-control']);
});
req.on('error', e => console.error(e.message));
req.end();
